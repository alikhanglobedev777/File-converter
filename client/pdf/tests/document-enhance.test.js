import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { enhanceDocumentPixels, PHOTO_PRESETS } from '../src/utils/documentEnhance.js';

const pixels = (array, width, height) => ({ data: new Uint8ClampedArray(array), width, height });
test('presets are bounded and original does not modify photo pixels', () => {
  assert.deepEqual(PHOTO_PRESETS, ['original', 'document', 'grayscale', 'black-white']);
  const source = pixels([23,44,67,255, 228,231,229,255], 2, 1);
  assert.equal(enhanceDocumentPixels(source, 'original'), source);
  assert.deepEqual([...source.data], [23,44,67,255, 228,231,229,255]);
  assert.throws(() => enhanceDocumentPixels(source, 'unknown'));
  assert.throws(() => enhanceDocumentPixels(source, 'document', 101));
});
test('black and white, grayscale and document modes retain alpha and enhance tones', () => {
  const values=[15,34,65,255, 100,130,150,255, 235,230,220,255];
  for (const preset of ['document', 'grayscale', 'black-white']) {
    const image = pixels(values, 3, 1);
    enhanceDocumentPixels(image, preset, 80);
    assert.equal(image.data.length, 12);
    assert.deepEqual([image.data[3],image.data[7],image.data[11]], [255,255,255]);
    assert.notDeepEqual([...image.data], values);
    if (preset !== 'document') for(let i=0;i<12;i+=4)
      assert.equal(image.data[i], image.data[i+1]);
  }
});
test('pixel and shape limits prevent oversized canvas enhancement', () => {
  assert.throws(() => enhanceDocumentPixels(pixels([], 0, 1)));
  assert.throws(() => enhanceDocumentPixels(pixels([1,2,3,4], 2, 2)));
  assert.throws(() => enhanceDocumentPixels({ data: new Uint8ClampedArray(4), width: 2000, height: 2000 }));
});
test('before-after photo controls are optional and OCR pipeline remains explicit', async () => {
  const enhancer = await readFile(new URL('../src/components/DocumentPhotoEnhancer.jsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../src/components/OcrWorkspace.jsx', import.meta.url), 'utf8');
  assert.match(enhancer, /Before/);
  assert.match(enhancer, /After/);
  assert.match(enhancer, /Use enhanced photo/);
  assert.match(enhancer, /Download JPG/);
  assert.match(workspace, /Enhance photo before OCR/);
  assert.match(workspace, /onApply=\{enhanced => \{ chooseFile\(enhanced\)/);
  assert.match(workspace, /Recognize text/);
  assert.doesNotMatch(enhancer, /fetch\(|FormData|XMLHttpRequest/);
});
