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
  assert.equal(isTableLayout({ width: 300, height: 240, cells: [
    { x: 20, y: 10, width: 60, height: 20, stroke: '000000' },
    { x: 80, y: 10, width: 80, height: 20, stroke: '000000' },
    { x: 20, y: 30, width: 60, height: 20, stroke: '000000' },
    { x: 80, y: 30, width: 80, height: 20, stroke: '000000' },
  ], items: [
    item('A', 25, 12), item('B', 85, 12),
    item('C', 25, 32), item('D', 85, 32),
  ] }), true);
});


test('repeated CV background panels with sparse text are not a Word table', () => {
  const panels = Array.from({ length: 4 }, (_, i) => [
    { x: 25, y: 35 + i * 38, width: 260, height: 36, fill: '29444B', stroke: 'DDEEFF' },
    { x: 285, y: 35 + i * 38, width: 260, height: 36, fill: '29444B', stroke: 'DDEEFF' },
  ]).flat();
  assert.equal(isTableLayout({
    width: 595, height: 842, cells: panels,
    items: [item('Muhammad Ali', 42, 43, 160)],
  }), false, 'empty decorative boxes must never become a giant Word table');
});

test('background rectangles that surround normal resume text do not become a table', () => {
  const rects = [0, 1, 2, 3].flatMap(row => [
    { x: 20, y: 20 + row * 42, width: 285, height: 40, stroke: '000000' },
    { x: 305, y: 20 + row * 42, width: 265, height: 40, stroke: '000000' },
  ]);
  const texts = [item('Name', 45, 25), item('Contact', 330, 25)];
  assert.equal(isTableLayout({ width: 600, height: 842, cells: rects, items: texts }), false);
});
