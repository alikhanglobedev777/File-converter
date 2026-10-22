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


test('scalar constructPath opcode is recognized without throwing', () => {
  const list = {
    fnArray: [OPS.constructPath, OPS.fill],
    argsArray: [[OPS.rectangle, [40, 620, 100, 30]], []],
  };
  const found = extractGraphics(list, OPS, Util, viewport);
  assert.equal(found.rectangles.length, 1);
  assert.equal(found.rectangles[0].x, 40);
  assert.equal(found.rectangles[0].y, 150);
});

test('mutating applyTransform also preserves image bounds', () => {
  const mutating = {
    ...Util,
    applyTransform(point, matrix) {
      const x = point[0], y = point[1];
      point[0] = matrix[0] * x + matrix[2] * y + matrix[4];
      point[1] = matrix[1] * x + matrix[3] * y + matrix[5];
      // Mimic pdfjs-dist versions which return undefined.
    },
  };
  const list = {
    fnArray: [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore],
    argsArray: [[], [72, 0, 0, 48, 20, 580], ['logo'], []],
  };
  const found = extractGraphics(list, OPS, mutating, viewport);
  assert.equal(found.images.length, 1);
  assert.deepEqual(found.images[0], {
    x: 20, y: 172, width: 72, height: 48,
  });
});


test('real pdfkit rectangle operator is understood by the graphics parser', async () => {
  const PDFKit = require('pdfkit');
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const path = require('node:path');
  const { openPdf, extractLayout } = require('../services/pdf-layout');
  const buffer = await new Promise((resolve, reject) => {
    const doc = new PDFKit({ size: [600, 420], margin: 20 });
    const chunks = [];
    doc.on('data', part => chunks.push(part));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.rect(30, 80, 180, 30).fillAndStroke('#112233', '#000000');
    doc.rect(210, 80, 180, 30).fillAndStroke('#112233', '#000000');
    doc.rect(30, 110, 180, 30).fillAndStroke('#FFFFFF', '#000000');
    doc.rect(210, 110, 180, 30).fillAndStroke('#FFFFFF', '#000000');
    doc.end();
  });
  const filename = path.join(os.tmpdir(), 'pdf-operator-sample-' + process.pid + '.pdf');
  await fs.writeFile(filename, buffer);
  const pdf = await openPdf(filename);
  try {
    const page = await pdf.getPage(1);
    const { OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const ops = await page.getOperatorList();
    const shape = ops.fnArray.map((fn, i) => ({ fn, args:ops.argsArray[i] }))
      .filter(entry => entry.fn === OPS.constructPath).slice(0, 6);
    const describe = entry => {
      const args = entry.args || [];
      const describeItem = (v) => v == null ? 'null' :
        typeof v === 'number' ? { type:'number',value:v } :
        typeof v === 'object' ? { type:v.constructor?.name,
          len:v.length, sample:Array.from(v).slice(0, 14) } :
        {type:typeof v,value:String(v).slice(0, 60)};
      return {
        argsType: args.constructor?.name,
        array: Array.isArray(args),
        args: Array.isArray(args)?args.map(describeItem):describeItem(args),
      };
    };
    console.log('PDF_OPERATOR_SHAPES:', JSON.stringify(shape.map(describe)));
    const layout = await extractLayout(page);
    assert.ok(layout.graphics.rectangles.length >= 4,
      'PDFKit page contains at least four native rectangles');
  } finally {
    await pdf.destroy();
    await fs.rm(filename, { force:true });
  }
});
