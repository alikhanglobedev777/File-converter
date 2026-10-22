const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const PDFKit = require('pdfkit');
const ExcelJS = require('exceljs');
const { convertPdfToExcelFallback } = require('../services/pdfToExcel-fallback');

test('PDF to Excel fallback exports complete editable text and source image', async () => {
  const pdf = await new Promise((resolve, reject) => {
    const doc = new PDFKit({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.addPage({ size: [612, 792], margin: 20 });
    doc.font('Helvetica-Bold').fontSize(22).text('Muhammad Ali', 60, 80);
    doc.font('Helvetica').fontSize(10).text('Lahore', 60, 140);
    doc.text('Full Stack Developer', 60, 200);
    doc.end();
  });

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pdf-fallback-test-'));
  const source = path.join(directory, 'sample.pdf');
  let output;
  try {
    await fs.writeFile(source, pdf);
    output = await convertPdfToExcelFallback(source);
    const book = new ExcelJS.Workbook();
    await book.xlsx.readFile(output);
    assert.deepEqual(book.worksheets.map(sheet => sheet.name),
      ['Conversion Notes', 'Page 1', 'Original 1']);
    const sheet = book.getWorksheet('Page 1');
    const data = sheet.getColumn(3).values.join(' ');
    assert.match(data, /Muhammad Ali/);
    assert.match(data, /Lahore/);
    assert.match(data, /Full Stack Developer/);
    assert.equal(typeof sheet.getCell('C2').value, 'string');
    const original = book.getWorksheet('Original 1');
    assert.ok(original.getImages().length === 1 ||
      /preview could not be rendered/i.test(original.getCell('A1').value || ''),
      'visual reference or explicit rendering failure must be provided');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
    if (output) await fs.rm(output, { force: true });
  }
});
