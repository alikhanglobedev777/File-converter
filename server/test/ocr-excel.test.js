const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { validateOcrTables } = require('../routes/ocr-route');
const { app } = require('../server');

test('OCR table inputs have strict limits and literal cells only', () => {
  assert.deepEqual(validateOcrTables([{ page: 1, rows: [['Heading', 'Amount'], ['Ali', '5']] }])?.length, 1);
  assert.equal(validateOcrTables([{ page: 0, rows: [['bad']] }]), null);
  assert.equal(validateOcrTables([{ page: 1, rows: [] }]), null);
  assert.equal(validateOcrTables([{ page: 1, rows: [['x'.repeat(257)]] }]), null);
  assert.equal(validateOcrTables([{ page: 1, rows: [Array(13).fill('x')] }]), null);
  assert.equal(validateOcrTables([{ page: 1, rows: [['test']] }, { page: 1, rows: [['duplicate']] }]), null);
  assert.equal(validateOcrTables([{ page: 2, rows: [['test']] }, { page: 1, rows: [['reversed']] }]), null);
  assert.equal(validateOcrTables([{ page: 1, rows: [[{ formula: '2+2' }]] }]), null);
});

test('reviewed OCR table exports genuine editable XLSX with no executable formula input', async () => {
  const listener = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  try {
    const url = 'http://127.0.0.1:' + listener.address().port + '/api/ocr/excel';
    const bad = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tables: [{ page: 1, rows: [[null]] }] }),
    });
    assert.equal(bad.status, 400);

    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tables: [
        { page: 1, rows: [['Name', 'Cost'], ['Ali', '1,234'], ['Formula', '=SUM(1,2)']] },
        { page: 2, rows: [['A second page', 'still editable']] },
      ] }),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, bytes.toString().slice(0, 150));
    assert.match(response.headers.get('content-type'), /spreadsheetml.sheet/);
    assert.match(response.headers.get('content-disposition'), /reviewed-ocr-tables\.xlsx/);
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    assert.equal(book.worksheets.length, 2);
    assert.equal(book.getWorksheet('Page 1').getCell('B2').value, '1,234');
    const formulaCell = book.getWorksheet('Page 1').getCell('B3');
    assert.equal(typeof formulaCell.value, 'string');
    assert.equal(formulaCell.value, "'=SUM(1,2)");
    assert.equal(book.getWorksheet('Page 2').getCell('A1').value, 'A second page');
  } finally {
    await new Promise(resolve => listener.close(resolve));
  }
});
