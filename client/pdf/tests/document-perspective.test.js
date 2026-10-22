import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  detectDocumentCorners, insetDocumentCorners, isValidDocumentCorners, rectifyDocumentPixels,
} from '../src/utils/documentPerspective.js';

const makeImage = (width, height, background = [40, 40, 40]) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data.set([...background, 255], i);
  }
  return { width, height, data };
};
const pixel = (image, x, y) => [...image.data.slice((Math.round(y) * image.width + Math.round(x)) * 4,
  (Math.round(y) * image.width + Math.round(x)) * 4 + 3)];
const setPixel = (image, x, y, color) => image.data.set([...color, 255], (y * image.width + x) * 4);
function fillQuadrilateral(image, corners) {
  const inside = (x, y) => {
    let contains = false;
    for (let i = 0, j = 3; i < 4; j = i++) {
      const a = corners[i], b = corners[j];
      if ((a.y > y) !== (b.y > y) &&
        x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) contains = !contains;
    }
    return contains;
  };
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    if (!inside(x, y)) continue;
    // Lines of black type should not break detection of the page.
    setPixel(image, x, y, y % 18 < 2 && x > 140 && x < 260
      ? [20, 20, 20] : [245, 245, 245]);
  }
}

test('auto detection identifies four corners on a tilted trapezoid page', () => {
  const photo = makeImage(420, 340);
  const expected = [{ x: 85, y: 30 }, { x: 350, y: 58 },
    { x: 320, y: 305 }, { x: 65, y: 282 }];
  fillQuadrilateral(photo, expected);
  const corners = detectDocumentCorners(photo);
  assert.ok(corners, 'document should be detected against a contrasting background');
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.hypot(corners[i].x - expected[i].x, corners[i].y - expected[i].y) < 10,
      'corner ' + i + ' should be within 10 source pixels');
  }
  assert.equal(isValidDocumentCorners(corners, 420, 340), true);
  const output = rectifyDocumentPixels(photo, corners);
  assert.ok(output.width > 220 && output.width < 290);
  assert.ok(output.height > 230 && output.height < 290);
  assert.ok(pixel(output, output.width / 2, output.height / 2)[0] > 200);
});

test('projective correction produces a real rectangular crop without stretching the background', () => {
  const src = makeImage(220, 180);
  const quad = [{ x: 30, y: 20 }, { x: 195, y: 37 },
    { x: 176, y: 161 }, { x: 40, y: 147 }];
  fillQuadrilateral(src, quad);
  const corrected = rectifyDocumentPixels(src, quad);
  assert.ok(corrected.width > 140 && corrected.height > 110);
  assert.deepEqual(pixel(corrected, corrected.width * .5, corrected.height * .5), [245,245,245]);
});

test('parallel and straight rectangle inputs use the affine path', () => {
  const original = makeImage(100, 100, [91, 140, 190]);
  const corners = [{ x: 5, y: 4 }, { x: 94, y: 4 }, { x: 94, y: 89 }, { x: 5, y: 89 }];
  assert.equal(isValidDocumentCorners(corners, 100, 100), true);
  const result = rectifyDocumentPixels(original, corners);
  assert.ok(result.width > 80 && result.height > 80);
  assert.deepEqual(pixel(result, 20, 20), [91,140,190]);
});

test('ambiguous images are preserved rather than aggressively auto-cropped', () => {
  assert.equal(detectDocumentCorners(makeImage(420, 340, [250, 250, 250])), null);
  const background = makeImage(420, 340);
  for (let y = 0; y < 340; y++) for (let x = 0; x < 420; x++) {
    if ((Math.floor(x / 10) + Math.floor(y / 10)) % 2) setPixel(background, x, y, [180, 180, 180]);
  }
  assert.equal(detectDocumentCorners(background), null);
  assert.equal(detectDocumentCorners({ width: 9000, height: 9000, data: new Uint8ClampedArray(4) }), null);
});

test('manual corner validation rejects crossings, slivers and out-of-image positions', () => {
  const good = insetDocumentCorners(500, 300);
  assert.equal(isValidDocumentCorners(good, 500, 300), true);
  assert.equal(isValidDocumentCorners([good[0],good[2],good[1],good[3]],500,300), false);
  assert.equal(isValidDocumentCorners(good.map(p => ({ x: -10, y: p.y })),500,300), false);
  assert.throws(() => rectifyDocumentPixels(makeImage(500, 300), [good[0],good[2],good[1],good[3]]),
    /four document corners/);
  assert.throws(() => rectifyDocumentPixels(makeImage(500, 300),good,5_000),
    /Invalid output pixel limit/);
});

test('perspective enhancement is optional, bounded and remains local to the browser', async () => {
  const source = await readFile(new URL('../src/components/DocumentPhotoEnhancer.jsx', import.meta.url), 'utf8');
  const module = await readFile(new URL('../src/utils/documentPerspective.js', import.meta.url), 'utf8');
  assert.match(source, /detectDocumentCorners\(image\)/);
  assert.match(source, /rectifyDocumentPixels\(base, cropCorners\)/);
  assert.match(source, /Adjust corners/);
  assert.match(source, /Apply corners/);
  assert.match(source, /Keep full photo/);
  assert.match(source, /onPointerMove=\{moveDrag\}/);
  assert.match(source, /Use enhanced photo/);
  assert.match(module, /3_000_000/);
  assert.doesNotMatch(source + module, /fetch\s*\(|FormData|XMLHttpRequest/);
});
