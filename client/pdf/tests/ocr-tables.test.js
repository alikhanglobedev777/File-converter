import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { proposeOcrTable, ocrTableHasContent,
  OCR_TABLE_MAX_ROWS, OCR_TABLE_MAX_COLUMNS } from '../src/utils/ocrTables.js';

test('OCR table suggestions use conservative delimiters and allow user changes', () => {
  const native = proposeOcrTable('Item    Price\nPaper    10\nBook    15');
  assert.deepEqual(native, [['Item', 'Price'], ['Paper', '10'], ['Book', '15']]);
  assert.deepEqual(proposeOcrTable('First Last Name\nJohn Smith'), [
    ['First Last Name'], ['John Smith'],
  ], 'do not split normal names on single spaces');
  assert.deepEqual(proposeOcrTable('A,B\n1,2', 'commas'), [['A', 'B'], ['1', '2']]);
  assert.deepEqual(proposeOcrTable('A\tB\n1\t2', 'tabs'), [['A', 'B'], ['1', '2']]);
});

test('OCR table rows, columns and cell lengths are bounded', () => {
  const rows = proposeOcrTable(Array(100).fill('a  b  c').join('\n'));
  assert.equal(rows.length, OCR_TABLE_MAX_ROWS);
  const cells = proposeOcrTable('a  '.repeat(100));
  assert.equal(cells[0].length, OCR_TABLE_MAX_COLUMNS);
  assert.equal(proposeOcrTable('x'.repeat(500))[0][0].length, 256);
  assert.equal(ocrTableHasContent([['', '0']]), true);
  assert.equal(ocrTableHasContent([['', '']]), false);
});

test('OCR Excel UI requires review and exports only editable cells', async () => {
  const source = await readFile(new URL('../src/components/OcrTableEditor.jsx', import.meta.url), 'utf8');
  assert.match(source, /Review your Excel table/);
  assert.match(source, /Regenerate rows/);
  assert.match(source, /Add column/);
  assert.match(source, /api\/ocr\/excel/);
  assert.match(source, /JSON\.stringify\(\{ tables: submitted \}\)/);
  assert.doesNotMatch(source, /FormData|XMLHttpRequest/);
});
