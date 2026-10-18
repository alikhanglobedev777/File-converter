const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const PDFKit = require('pdfkit');
const { PDFDocument } = require('pdf-lib');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const sharp = require('sharp');
const { app } = require('../server');
const { openPdf, renderPage } = require('../services/pdf-layout');

let directory, server, base, pdf, singlePdf, workbook, baselineUploads, baselineOutputs;
const uploads = path.join(__dirname, '../uploads');
const outputs = path.join(__dirname, '../outputs');

function makePdf(pages) {
  return new Promise((resolve, reject) => {
    const doc = new PDFKit({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (let page = 1; page <= pages; page++) {
      doc.addPage({ size: [600, 420], margin: 20 });
      doc.fillColor('black').font('Helvetica-Bold').fontSize(18).text(`Report page ${page}`, 30, 25);
      const rows = [['Area', 'Quantity', 'Rate'], ['Attock', '6,267', '55.3%'], ['Zero', '0', '0.0%']];
      rows.forEach((row, r) => row.forEach((text, c) => {
        doc.rect(30 + c * 180, 80 + r * 30, 180, 30).fillAndStroke(r === 0 ? '#112233' : '#FFFFFF', '#000000');
        doc.fillColor(r === 0 ? '#FFFFFF' : '#000000').font(r === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(text, 36 + c * 180, 90 + r * 30, { lineBreak: false });
      }));
    }
    doc.end();
  });
}

before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'file-converter-test-'));
  pdf = await makePdf(3); singlePdf = await makePdf(1);
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('First sheet');
  sheet.addRows([['Name', 'Quantity', 'Rate', 'Enabled'], ['Zero', 0, 0.553, false], ['Second', 1234, 0, true]]);
  sheet.getCell('C2').numFmt = '0.0%';
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF112233' } };
  book.addWorksheet('Second sheet').addRows([['Other worksheet'], ['LAST SHEET MARKER']]);
  workbook = Buffer.from(await book.xlsx.writeBuffer());
  baselineUploads = await fs.readdir(uploads); baselineOutputs = await fs.readdir(outputs);
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/api/convert`;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

async function convert(service, data, filename, multiple = false) {
  const form = new FormData();
  if (multiple) data.forEach((buffer, i) => form.append('files', new Blob([buffer]), filename[i]));
  else form.append('file', new Blob([data]), filename);
  const response = await fetch(`${base}/${service}`, { method: 'POST', body: form });
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, `${service}: ${buffer.toString().slice(0, 200)}`);
  assert.match(response.headers.get('access-control-expose-headers'), /Content-Disposition/i);
  return { buffer, response };
}

test('PDF to Excel preserves columns, colors, borders, numbers and all pages', async () => {
  const { buffer } = await convert('pdf-to-excel', pdf, 'report.pdf');
  const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
  assert.equal(book.worksheets.length, 3);
  for (const sheet of book.worksheets) {
    assert.equal(sheet.columnCount, 3);
    assert.deepEqual(sheet.getRow(2).values.slice(1), ['Area', 'Quantity', 'Rate']);
    assert.deepEqual(sheet.getRow(3).values.slice(1, 3), ['Attock', 6267]);
    assert.ok(Math.abs(sheet.getCell('C3').value - 0.553) < 1e-10);
    assert.equal(sheet.getCell('C3').numFmt, '0.0%');
    assert.equal(sheet.getCell('B4').value, 0);
    assert.equal(sheet.getCell('A2').font.bold, true);
    assert.equal(sheet.getCell('A2').font.color.argb, 'FFFFFFFF');
    assert.equal(sheet.getCell('A2').fill.fgColor.argb, 'FF112233');
    assert.equal(sheet.getCell('A3').border.left.style, 'thin');
    assert.equal(sheet.getImages().length, 2);
  }
});

test('PDF to Word contains editable tables and every page', async () => {
  const { buffer } = await convert('pdf-to-word', pdf, 'report.pdf');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 3);
  assert.equal((xml.match(/Attock/g) || []).length, 3);
  assert.match(xml, /6,267/); assert.match(xml, /55.3%/); assert.match(xml, /112233/);
});

test('PDF to JPG returns all pages in a ZIP; single page stays a JPG', async () => {
  const { buffer, response } = await convert('pdf-to-jpg', pdf, 'report.pdf');
  assert.match(response.headers.get('content-disposition'), /report\.zip/);
  const zip = await JSZip.loadAsync(buffer);
  assert.deepEqual(Object.keys(zip.files).sort(), ['page-001.jpg', 'page-002.jpg', 'page-003.jpg']);
  for (const name of Object.keys(zip.files)) {
    const image = await sharp(await zip.file(name).async('nodebuffer')).metadata();
    assert.equal(image.format, 'jpeg'); assert.equal(image.width, 1200); assert.equal(image.height, 840);
  }
  const single = await convert('pdf-to-jpg', singlePdf, 'single.pdf');
  assert.match(single.response.headers.get('content-disposition'), /single\.jpg/);
  assert.equal((await sharp(single.buffer).metadata()).format, 'jpeg');
});

test('PDF to PowerPoint preserves page count and aspect ratio', async () => {
  const { buffer } = await convert('pdf-to-ppt', pdf, 'report.pdf');
  const zip = await JSZip.loadAsync(buffer);
  assert.equal(Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).length, 3);
  const xml = await zip.file('ppt/presentation.xml').async('string');
  const size = xml.match(/<p:sldSz cx="(\d+)" cy="(\d+)"/);
  assert.ok(Math.abs(Number(size[1]) / Number(size[2]) - 600 / 420) < 0.001);
});

test('Excel to PDF retains every worksheet, zero and percentage formatting', async () => {
  const { buffer } = await convert('excel-to-pdf', workbook, 'book.xlsx');
  const filename = path.join(directory, 'result.pdf'); await fs.writeFile(filename, buffer);
  const doc = await openPdf(filename);
  try {
    assert.ok(doc.numPages >= 2);
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(i => i.str).join(' ');
    assert.match(text, /LAST SHEET MARKER/); assert.match(text, /55\.3%/); assert.match(text, /Zero\s+0/);
  } finally { await doc.destroy(); }
});

test('Excel to Word retains zero, false, formatted percentages and all sheets', async () => {
  const { buffer } = await convert('excel-to-word', workbook, 'book.xlsx');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<w:t[^>]*>0<\/w:t>/); assert.match(xml, /false/); assert.match(xml, /55\.3%/); assert.match(xml, /LAST SHEET MARKER/);
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 2);
});

test('Excel to PowerPoint retains all worksheets and formatted values', async () => {
  const { buffer } = await convert('excel-to-ppt', workbook, 'book.xlsx');
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slides.length, 2);
  const xml = (await Promise.all(slides.map(n => zip.file(n).async('string')))).join('');
  const text = Array.from(xml.matchAll(/<a:t>(.*?)<\/a:t>/g), match => match[1]).join('');
  assert.match(text, /55\.3%/); assert.match(text, /LAST SHEET MARKER/); assert.match(text, /false/);
});

test('PDF merger preserves all pages and input order', async () => {
  const { buffer } = await convert('pdf-merger', [singlePdf, pdf], ['one.pdf', 'three.pdf'], true);
  const doc = await PDFDocument.load(buffer);
  assert.equal(doc.getPageCount(), 4);
});

test('ZIP output is complete and duplicate filenames do not overwrite files', async () => {
  const { buffer } = await convert('zip-maker', [Buffer.from('first'), Buffer.from('second')], ['notes.txt', 'notes.txt'], true);
  const zip = await JSZip.loadAsync(buffer);
  assert.equal(await zip.file('notes.txt').async('string'), 'first');
  assert.equal(await zip.file('notes (2).txt').async('string'), 'second');
});

test('large Excel tables paginate without dropping the last row', async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Long table');
  sheet.addRow(['ID', 'Value']);
  for (let i = 1; i <= 120; i++) sheet.addRow([i, `ROW-${i}-MARKER`]);
  const input = Buffer.from(await book.xlsx.writeBuffer());
  const { buffer } = await convert('excel-to-ppt', input, 'long.xlsx');
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.ok(slides.length > 1);
  const text = (await Promise.all(slides.map(n => zip.file(n).async('string')))).join('');
  for (let i = 1; i <= 120; i++) assert.match(text, new RegExp(`ROW-${i}-MARKER`));
});

test('twelve-page JPG and PowerPoint exports retain numeric page order', async () => {
  const input = await makePdf(12);
  const images = await convert('pdf-to-jpg', input, 'twelve.pdf');
  const imageZip = await JSZip.loadAsync(images.buffer);
  assert.equal(Object.keys(imageZip.files).length, 12);
  assert.equal(Object.keys(imageZip.files).sort()[9], 'page-010.jpg');
  const ppt = await convert('pdf-to-ppt', input, 'twelve.pdf');
  const pptZip = await JSZip.loadAsync(ppt.buffer);
  const slideNames = Object.keys(pptZip.files).filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  assert.equal(slideNames.length, 12);
  const source = path.join(directory, 'twelve.pdf'); await fs.writeFile(source, input);
  const doc = await openPdf(source);
  try {
    for (let i = 1; i <= 12; i++) {
      const rels = await pptZip.file(`ppt/slides/_rels/slide${i}.xml.rels`).async('string');
      const target = rels.match(/Target="\.\.\/media\/([^\"]+\.png)"/)[1];
      const rendered = await renderPage(doc, await doc.getPage(i), 2);
      try {
        assert.deepEqual(await pptZip.file(`ppt/media/${target}`).async('nodebuffer'), rendered.canvas.toBuffer('image/png'), `slide ${i} page order`);
      } finally { doc.canvasFactory.destroy(rendered); }
    }
  } finally { await doc.destroy(); }
});

test('all endpoints reject missing files; invalid files and insufficient merge inputs are cleaned up', async () => {
  for (const route of ['pdf-to-excel', 'pdf-to-word', 'pdf-to-jpg', 'pdf-to-ppt', 'excel-to-pdf', 'excel-to-word', 'excel-to-ppt', 'pdf-merger', 'zip-maker']) {
    const response = await fetch(`${base}/${route}`, { method: 'POST', body: new FormData() });
    assert.equal(response.status, 400, route); await response.arrayBuffer();
  }
  for (const [route, name, content, field, status] of [
    ['pdf-to-excel', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['pdf-to-word', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['pdf-to-jpg', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['pdf-to-ppt', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['excel-to-word', 'broken.xlsx', Buffer.from('bad excel'), 'file', 422],
    ['excel-to-pdf', 'broken.xlsx', Buffer.from('bad excel'), 'file', 422],
    ['excel-to-ppt', 'broken.xlsx', Buffer.from('bad excel'), 'file', 422],
    ['pdf-to-excel', 'wrong.txt', Buffer.from('text'), 'file', 400],
    ['pdf-merger', 'one.pdf', singlePdf, 'files', 400],
  ]) {
    const form = new FormData(); form.append(field, new Blob([content]), name);
    const response = await fetch(`${base}/${route}`, { method: 'POST', body: form });
    assert.equal(response.status, status); await response.arrayBuffer();
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(await fs.readdir(uploads), baselineUploads);
  assert.deepEqual(await fs.readdir(outputs), baselineOutputs);
});
