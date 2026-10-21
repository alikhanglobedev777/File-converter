const test = require('node:test');
const assert = require('node:assert/strict');
const { positionedLines, isTableLayout } = require('../services/pdf-layout');

const item = (text, x, y, width = 35) => ({
  text, x, y, width, size: 10, font: 'Arial',
  color: '000000', bold: false, italic: false,
});

test('non-table PDF headings and side-by-side content keep their positions', () => {
  const lines = positionedLines([
    item('Resume', 40, 20, 60),
    item('Contact', 350, 50, 65),
    item('Summary', 40, 50, 65),
  ]);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1].segments.map(x => x.x), [40, 350]);
  assert.deepEqual(lines[1].segments.map(x => x.text), ['Summary', 'Contact']);
});

test('adjacent fragments join but separated columns do not', () => {
  const lines = positionedLines([item('Hello', 30, 40, 22), item('world', 54, 40, 26), item('Right', 290, 40, 30)]);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].segments.length, 2);
  assert.equal(lines[0].segments[0].text, 'Hello world');
});

test('decorative boxes are not mistaken for actual tables', () => {
  assert.equal(isTableLayout({ cells: [
    { x: 20, y: 10, width: 60, height: 20 },
    { x: 100, y: 10, width: 80, height: 20 },
    { x: 20, y: 60, width: 60, height: 50 },
    { x: 100, y: 130, width: 80, height: 30 },
  ] }), false);
  assert.equal(isTableLayout({ cells: [
    { x: 20, y: 10, width: 60, height: 20 }, { x: 80, y: 10, width: 80, height: 20 },
    { x: 20, y: 30, width: 60, height: 20 }, { x: 80, y: 30, width: 80, height: 20 },
  ] }), true);
});
