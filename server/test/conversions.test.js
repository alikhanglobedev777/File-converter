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
// This integration suite exercises many routes from one loopback IP in one run.
// Increase the limit only for this test process before the app creates its
// rate-limiting middleware. Production keeps its configured/default limit.
process.env.CONVERT_RATE_LIMIT = '250';
const { app } = require('../server');
const { openPdf, renderPage } = require('../services/pdf-layout');

let directory, server, base, pdf, singlePdf, workbook, baselineUploads, baselineOutputs;
const uploads = path.join(__dirname, '../uploads');
const outputs = path.join(__dirname, '../outputs');

function makePdf(pages, label = 'Report') {
  return new Promise((resolve, reject) => {
    const doc = new PDFKit({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (let page = 1; page <= pages; page++) {
      doc.addPage({ size: [600, 420], margin: 20 });
      doc.fillColor('black').font('Helvetica-Bold').fontSize(18).text(`${label} page ${page}`, 30, 25);
      const rows = [['Area', 'Quantity', 'Rate'], ['Attock', '6,267', '55.3%'], ['Zero', '0', '0.0%']];
      rows.forEach((row, r) => row.forEach((text, c) => {
        doc.rect(30 + c * 180, 80 + r * 30, 180, 30).fillAndStroke(r === 0 ? '#112233' : '#FFFFFF', '#000000');
        doc.fillColor(r === 0 ? '#FFFFFF' : '#000000').font(r === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).text(text, 36 + c * 180, 90 + r * 30, { lineBreak: false });
      }));
    }
    doc.end();
  });
}

async function makeImage(width, height, color, label, format = 'png') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${color}"/><text x="24" y="56" font-size="32" font-family="Arial" fill="white">${label}</text></svg>`;
  const image = sharp(Buffer.from(svg));
  return format === 'jpg' ? image.jpeg().toBuffer() : image.png().toBuffer();
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

async function convert(service, data, filename, multiple = false, options = null) {
  const form = new FormData();
  if (multiple) data.forEach((buffer, i) => form.append('files', new Blob([buffer]), filename[i]));
  else form.append('file', new Blob([data]), filename);
  if (options !== null && options !== undefined) {
    if (typeof options === 'object' && !Array.isArray(options)) {
      for (const [key, value] of Object.entries(options)) form.append(key, String(value));
    } else {
      form.append('page', String(options));
    }
  }
  const response = await fetch(`${base}/${service}`, { method: 'POST', body: form });
  const buffer = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200, `${service}: ${buffer.toString().slice(0, 200)}`);
  assert.match(response.headers.get('access-control-expose-headers'), /Content-Disposition/i);
  const expected = {
    'pdf-to-excel': ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    'pdf-to-word': ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'pdf-to-jpg': ['jpg', 'image/jpeg'],
    'pdf-to-ppt': ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    'excel-to-pdf': ['pdf', 'application/pdf'],
    'excel-to-word': ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    'excel-to-ppt': ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    'pdf-compressor': ['pdf', 'application/pdf'],
    'pdf-splitter': ['pdf', 'application/pdf'],
    'image-to-pdf': ['pdf', 'application/pdf'],
    'pdf-organizer': ['pdf', 'application/pdf'],
    'pdf-merger': ['pdf', 'application/pdf'],
    'zip-maker': ['zip', 'application/zip'],
  };
  const [extension, mime] = expected[service];
  assert.equal(response.headers.get('content-type'), mime, `${service}: Content-Type`);
  assert.match(response.headers.get('content-disposition'), new RegExp(`\\.${extension}(?:"|;|$)`, 'i'), `${service}: download filename`);
  assert.equal(buffer.subarray(0, extension === 'pdf' ? 5 : 2).toString(), extension === 'pdf' ? '%PDF-' :
    extension === 'jpg' ? Buffer.from([0xff, 0xd8]).toString() : 'PK', `${service}: file signature`);
  return { buffer, response };
}

test('PDF to Excel preserves editable table values, styles, and all pages', async () => {
  const { buffer } = await convert('pdf-to-excel', pdf, 'report.pdf');
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer);
  assert.equal(book.worksheets.length, 9);
  for (let page = 1; page <= 3; page++) {
    const sheet = book.getWorksheet('Page ' + page);
    const values = [], cells = [];
    sheet.eachRow(row => row.eachCell(cell => {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        values.push(String(cell.value)); cells.push(cell);
      }
    }));
    const data = values.join(' ');
    for (const value of ['Area', 'Quantity', 'Rate', 'Attock', '6267', '0'])
      assert.ok(data.includes(value), 'missing native Excel cell: ' + value);
    assert.ok(cells.some(cell => cell.value === 0.553 && cell.numFmt === '0.0%'));
    assert.ok(cells.some(cell => cell.font?.bold), 'header text should retain boldness');
    assert.ok(cells.some(cell => cell.fill?.fgColor?.argb === 'FF112233'),
      'header background should remain editable cell styling');
    assert.ok(cells.some(cell => cell.border?.left || cell.border?.top),
      'table borders should be native Excel cell borders');
    assert.equal(sheet.getImages().length, 0,
      'a table should not be a pasted PDF screenshot');
    assert.equal(book.getWorksheet('Original ' + page).getImages().length, 1);
    const textItems = book.getWorksheet('Text ' + page).getColumn(3).values.join(' ');
    assert.ok(textItems.includes('Attock'));
  }
});

test('PDF to Word keeps native editable tables and decorative shapes', async () => {
  const { buffer } = await convert('pdf-to-word', pdf, 'report.pdf');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 3);
  assert.equal((xml.match(/Attock/g) || []).length, 3);
  assert.match(xml, /6,267/);
  assert.match(xml, /55.3%/);
  assert.match(xml, /112233/);
  assert.ok((xml.match(/<w:t\b/g) || []).length >= 10,
    'converted table cells must have native editable Word text');
});

test('PDF resume text stays editable, and Excel preserves the full visual page', async () => {
  const source = await new Promise((resolve, reject) => {
    const doc = new PDFKit({ autoFirstPage: false });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.addPage({ size: [612, 792], margin: 20 });
    doc.font('Helvetica-Bold').fontSize(24).text('Muhammad Ali', 66, 72);
    doc.font('Helvetica-Bold').fontSize(11).text('PERSONAL INFORMATION', 66, 155);
    doc.font('Helvetica').fontSize(10).text('Lahore', 66, 205, { lineBreak: false });
    doc.text('03021848264', 348, 205, { lineBreak: false });
    doc.font('Helvetica-Bold').text('CAREER OBJECTIVE', 66, 265);
    doc.font('Helvetica').text('Full Stack Developer building scalable applications and reliable systems.', 66, 300, { width: 480 });
    doc.end();
  });
  const excel = await convert('pdf-to-excel', source, 'resume.pdf');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excel.buffer);
  assert.deepEqual(wb.worksheets.map(sheet => sheet.name), ['Page 1', 'Text 1', 'Original 1']);
  assert.equal(wb.getWorksheet('Original 1').getImages().length, 1);
  const editable = wb.getWorksheet('Page 1');
  assert.ok(editable.columnCount < 128, 'columns should not be tiny fragments');
  assert.equal(editable.getImages().length, 0,
    'text-based PDF output should open as editable spreadsheet cells');
  const text = wb.getWorksheet('Text 1').getColumn(3).values.map(value => String(value || '')).join(' ');
  for (const expected of ['Muhammad Ali', 'PERSONAL INFORMATION', 'CAREER OBJECTIVE', 'Full Stack Developer', '03021848264']) {
    assert.ok(text.includes(expected), 'missing Excel data: ' + expected);
  }

  const word = await convert('pdf-to-word', source, 'resume.pdf');
  const zip = await JSZip.loadAsync(word.buffer);
  const xml = await zip.file('word/document.xml').async('string');
  for (const expected of ['Muhammad Ali', 'PERSONAL INFORMATION', 'CAREER OBJECTIVE', 'Full Stack Developer', '03021848264']) {
    assert.ok(xml.includes(expected), 'missing editable Word text: ' + expected);
  }
  assert.ok((xml.match(/<w:t\b/g) || []).length >= 5,
    'PDF content must be stored in editable Word text runs');
  // Embedded artwork is allowed, but all text must remain genuine Word runs.
  assert.ok((xml.match(/<w:t\b/g) || []).length >= 5);
});

test('Embedded PDF images remain individually movable beside editable Excel and Word text', async () => {
  const logo = await makeImage(96, 64, '#0C7A79', 'LOGO');
  const source = await new Promise((resolve, reject) => {
    const doc = new PDFKit({ autoFirstPage: false });
    const parts = [];
    doc.on('data', chunk => parts.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
    doc.addPage({ size: [612, 792], margin: 20 });
    doc.image(logo, 40, 45, { width: 96, height: 64 });
    doc.rect(40, 120, 500, 2).fill('#0C7A79');
    doc.fillColor('#222222').font('Helvetica-Bold').fontSize(18)
      .text('EDITABLE RESUME HEADING', 45, 145);
    doc.font('Helvetica').fontSize(11)
      .text('Native text must remain selectable and editable.', 45, 190);
    doc.end();
  });
  const excelResult = await convert('pdf-to-excel', source, 'graphic-resume.pdf');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelResult.buffer);
  const editable = workbook.getWorksheet('Page 1');
  assert.ok(editable.getImages().length >= 1,
    'embedded logo must be an individual image object on the editable sheet');
  const texts = [];
  editable.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === 'string') texts.push(cell.value);
  }));
  assert.ok(texts.join(' ').includes('EDITABLE RESUME HEADING'),
    'embedded logo must not replace native editable text');

  const wordResult = await convert('pdf-to-word', source, 'graphic-resume.pdf');
  const zip = await JSZip.loadAsync(wordResult.buffer);
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /EDITABLE RESUME HEADING/);
  assert.match(xml, /<a:blip\b/, 'Word should retain embedded logo separately from text');
  assert.match(xml, /<w:t\b/, 'Word output must have actual editable text runs');
});

test('PDF to JPG always returns a JPEG and exports the requested page', async () => {
  const first = await convert('pdf-to-jpg', pdf, 'report.pdf');
  assert.match(first.response.headers.get('content-disposition'), /report\.jpg/);
  assert.equal(first.response.headers.get('content-type'), 'image/jpeg');
  const image = await sharp(first.buffer).metadata();
  assert.equal(image.format, 'jpeg');
  assert.equal(image.width, 1200); assert.equal(image.height, 840);

  const second = await convert('pdf-to-jpg', pdf, 'report.pdf', false, 2);
  assert.match(second.response.headers.get('content-disposition'), /report-page-002\.jpg/);
  assert.equal((await sharp(second.buffer).metadata()).format, 'jpeg');
  assert.notDeepEqual(second.buffer, first.buffer, 'different pages must yield different images');

  const third = await convert('pdf-to-jpg', pdf, 'report.pdf', false, 3);
  assert.match(third.response.headers.get('content-disposition'), /report-page-003\.jpg/);
  assert.notDeepEqual(third.buffer, second.buffer);

  const single = await convert('pdf-to-jpg', singlePdf, 'single.pdf');
  assert.match(single.response.headers.get('content-disposition'), /single\.jpg/);
  assert.equal((await sharp(single.buffer).metadata()).format, 'jpeg');
});

test('PDF-to-JPG rejects invalid and out-of-range page numbers without leaving files', async () => {
  for (const selectedPage of ['0', '-2', '1.5', 'abc', '99999999999999999999', '4']) {
    const form = new FormData();
    form.append('file', new Blob([pdf]), 'three.pdf');
    form.append('page', selectedPage);
    const response = await fetch(`${base}/pdf-to-jpg`, { method: 'POST', body: form });
    assert.equal(response.status, 400, selectedPage);
    assert.match((await response.json()).error, /page/i);
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.deepEqual(await fs.readdir(uploads), baselineUploads);
  assert.deepEqual(await fs.readdir(outputs), baselineOutputs);
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

test('PDF compressor returns a valid PDF, preserves page count, and never grows a file', async () => {
  for (const level of ['lossless', 'balanced', 'strong']) {
    const { buffer, response } = await convert('pdf-compressor', pdf, 'report.pdf', false, { level });
    assert.match(response.headers.get('content-disposition'), /compressed\.pdf/i);
    assert.ok(buffer.length <= pdf.length, `${level}: output must not exceed original size`);
    const result = await PDFDocument.load(buffer);
    assert.equal(result.getPageCount(), 3, `${level}: all pages remain`);
  }
});

test('PDF export settings support orientation and paper size', async () => {
  const { buffer } = await convert('excel-to-pdf', workbook, 'book.xlsx', false, { paperSize: 'LETTER', orientation: 'landscape' });
  const document = await PDFDocument.load(buffer);
  const page = document.getPage(0);
  const { width, height } = page.getSize();
  assert.equal(Math.round(width), 792);
  assert.equal(Math.round(height), 612);
});

test('invalid compression and export settings return safe 400 errors', async () => {
  const cases = [
    ['pdf-compressor', pdf, 'doc.pdf', { level: 'unsupported' }],
    ['excel-to-pdf', workbook, 'doc.xlsx', { paperSize: 'A1' }],
    ['pdf-to-jpg', pdf, 'doc.pdf', { quality: '1' }],
  ];
  for (const [service, source, filename, fields] of cases) {
    const form = new FormData();
    form.append('file', new Blob([source]), filename);
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    const response = await fetch(`${base}/${service}`, { method: 'POST', body: form });
    assert.equal(response.status, 400, service);
    assert.ok((await response.json()).error, service);
  }
});

test('PDF splitter extracts the requested pages into one new PDF', async () => {
  const { buffer, response } = await convert('pdf-splitter', pdf, 'report.pdf', false, { pages: '2-3' });
  assert.match(response.headers.get('content-disposition'), /split\.pdf/i);
  const split = await PDFDocument.load(buffer);
  assert.equal(split.getPageCount(), 2);
  const location = path.join(directory, 'split-test.pdf');
  await fs.writeFile(location, buffer);
  const doc = await openPdf(location);
  try {
    const text = [];
    for (let i = 1; i <= 2; i++) text.push((await (await doc.getPage(i)).getTextContent()).items.map(item => item.str).join(' '));
    assert.match(text[0], /Report page 2/);
    assert.match(text[1], /Report page 3/);
  } finally { await doc.destroy(); }
});

test('Images to PDF keeps the image order and creates one page per image', async () => {
  const first = await makeImage(220, 160, '#1769e8', 'First', 'jpg');
  const second = await makeImage(180, 200, '#111111', 'Second', 'png');
  const { buffer, response } = await convert('image-to-pdf', [first, second], ['first.jpg', 'second.png'], true);
  assert.match(response.headers.get('content-disposition'), /images\.pdf/i);
  const doc = await PDFDocument.load(buffer);
  assert.equal(doc.getPageCount(), 2);
  const sizes = doc.getPages().map((page) => page.getSize());
  assert.equal(Math.round(sizes[0].width), 220);
  assert.equal(Math.round(sizes[0].height), 160);
  assert.equal(Math.round(sizes[1].width), 180);
  assert.equal(Math.round(sizes[1].height), 200);
});

test('PDF organizer reorders, removes and rotates pages', async () => {
  const { buffer, response } = await convert('pdf-organizer', pdf, 'report.pdf', false, { pages: '3,1', rotate: '3:90' });
  assert.match(response.headers.get('content-disposition'), /organized\.pdf/i);
  const organized = await PDFDocument.load(buffer);
  assert.equal(organized.getPageCount(), 2);
  assert.equal(organized.getPage(0).getRotation().angle, 90);
  assert.equal(organized.getPage(1).getRotation().angle, 0);
  const location = path.join(directory, 'organized-test.pdf');
  await fs.writeFile(location, buffer);
  const doc = await openPdf(location);
  try {
    const firstText = (await (await doc.getPage(1)).getTextContent()).items.map(item => item.str).join(' ');
    const secondText = (await (await doc.getPage(2)).getTextContent()).items.map(item => item.str).join(' ');
    assert.match(firstText, /Report page 3/);
    assert.match(secondText, /Report page 1/);
  } finally { await doc.destroy(); }
});

test('PDF merger combines three PDFs into one PDF and preserves all four pages in order', async () => {
  const first = await makePdf(1, 'FIRST-FILE');
  const middle = await makePdf(2, 'SECOND-FILE');
  const last = await makePdf(1, 'THIRD-FILE');
  const { buffer, response } = await convert('pdf-merger', [first, middle, last], ['one.pdf', 'two.pdf', 'three.pdf'], true);
  assert.match(response.headers.get('content-disposition'), /merged\.pdf/i);
  const merged = await PDFDocument.load(buffer);
  assert.equal(merged.getPageCount(), 4);
  const location = path.join(directory, 'merged-test.pdf');
  await fs.writeFile(location, buffer);
  const doc = await openPdf(location);
  try {
    const text = [];
    for (let i = 1; i <= 4; i++) {
      text.push((await (await doc.getPage(i)).getTextContent()).items.map(item => item.str).join(' '));
    }
    assert.match(text[0], /FIRST-FILE page 1/);
    assert.match(text[1], /SECOND-FILE page 1/);
    assert.match(text[2], /SECOND-FILE page 2/);
    assert.match(text[3], /THIRD-FILE page 1/);
  } finally { await doc.destroy(); }
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

test('twelve-page JPG page selection and PowerPoint exports retain page order', async () => {
  const input = await makePdf(12);
  const tenth = await convert('pdf-to-jpg', input, 'twelve.pdf', false, 10);
  assert.match(tenth.response.headers.get('content-disposition'), /twelve-page-010\.jpg/);
  assert.equal((await sharp(tenth.buffer).metadata()).format, 'jpeg');
  const last = await convert('pdf-to-jpg', input, 'twelve.pdf', false, 12);
  assert.match(last.response.headers.get('content-disposition'), /twelve-page-012\.jpg/);
  assert.notDeepEqual(tenth.buffer, last.buffer);
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
  for (const route of ['pdf-to-excel', 'pdf-to-word', 'pdf-to-jpg', 'pdf-to-ppt', 'excel-to-pdf', 'excel-to-word', 'excel-to-ppt', 'pdf-splitter', 'image-to-pdf', 'pdf-organizer', 'pdf-compressor', 'pdf-merger', 'zip-maker']) {
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
    ['pdf-compressor', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['pdf-splitter', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['pdf-organizer', 'broken.pdf', Buffer.from('bad pdf'), 'file', 422],
    ['image-to-pdf', 'broken.txt', Buffer.from('text'), 'files', 400],
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
