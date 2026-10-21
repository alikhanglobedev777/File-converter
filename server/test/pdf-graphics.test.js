const test = require('node:test');
const assert = require('node:assert/strict');
const { extractGraphics } = require('../services/pdf-graphics');

const OPS = {
  save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14,
  curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18,
  rectangle: 19, setFillRGBColor: 59, setStrokeRGBColor: 60,
  setLineWidth: 61, fill: 22, stroke: 23, fillStroke: 24,
  eoFill: 25, eoFillStroke: 26, closeStroke: 27,
  constructPath: 91, paintImageXObject: 85,
};
const Util = {
  transform: (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ],
  applyTransform: (p, m) => [
    p[0] * m[0] + p[1] * m[2] + m[4],
    p[0] * m[1] + p[1] * m[3] + m[5],
  ],
};
const viewport = { width: 600, height: 800, transform: [1,0,0,-1,0,800] };

test('real PDF.js constructPath rectangles retain fill, border and viewport coordinates', () => {
  const list = {
    fnArray: [OPS.setFillRGBColor, OPS.setStrokeRGBColor, OPS.constructPath, OPS.fillStroke],
    argsArray: [['112233'], ['000000'], [[OPS.rectangle], [50, 650, 180, 30], [50,650,230,680]], []],
  };
  const graphics = extractGraphics(list, OPS, Util, viewport);
  assert.equal(graphics.rectangles.length, 1);
  assert.deepEqual(graphics.rectangles[0], {
    x:50, y:120, width:180, height:30, fill:'112233', stroke:'000000', lineWidth:1,
  });
});

test('PDF line decorations and placed image locations are recognized', () => {
  const list = {
    fnArray: [OPS.constructPath, OPS.stroke, OPS.save, OPS.transform,
      OPS.paintImageXObject, OPS.restore],
    argsArray: [
      [[OPS.moveTo, OPS.lineTo], [50, 600, 250, 600]], [],
      [], [80, 0, 0, 50, 300, 400], ['imageId'], [],
    ],
  };
  const graphics = extractGraphics(list, OPS, Util, viewport);
  assert.equal(graphics.lines.length, 1);
  assert.equal(Math.round(graphics.lines[0].y1), 200);
  assert.equal(graphics.images.length, 1);
  assert.deepEqual(graphics.images[0], {
    x:300, y:350, width:80, height:50,
  });
});

test('restored transforms do not corrupt image placement', () => {
  const list = {
    fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore,
      OPS.paintImageXObject],
    argsArray: [[], [60,0,0,60,10,10], ['a'], [], ['b']],
  };
  const graphics = extractGraphics(list, OPS, Util, viewport);
  assert.equal(graphics.images.length, 1);
  assert.equal(Math.round(graphics.images[0].x), 10);
});
