import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseOcrTsv, makeSearchablePdf } from '../src/utils/ocrPdfExport.js';

const header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

test('OCR TSV boxes parse safely and reject invalid positions', () => {
  const data = [
    header,
    '5\t1\t1\t1\t1\t1\t10\t15\t40\t20\t98\tHello',
    '5\t1\t1\t1\t1\t2\t60\t15\t50\t20\t97\tWorld',
    '5\t1\t1\t1\t1\t3\t-1\t0\t5\t10\t99\tBad',
  ].join('\n');
  assert.deepEqual(parseOcrTsv(data).map(w => w.text), ['Hello', 'World']);
  assert.equal(parseOcrTsv(data, 1).length, 1);
  assert.deepEqual(parseOcrTsv(null), []);
});

test('searchable PDF keeps source pages and inserts machine-readable invisible text', async () => {
  const source = await PDFDocument.create();
  const page = source.addPage([600, 400]);
  page.drawRectangle({ x: 0, y: 0, width: 600, height: 400, color: { type: 'RGB', red: 0.4, green: 0.3, blue: 0.9 } });
  const native = source.addPage([600, 400]);
  const font = await source.embedFont(StandardFonts.Helvetica);
  native.drawText('Original selectable content', { x: 50, y: 300, font, size: 18 });
  const input = new Blob([await source.save()]);
  const blob = await makeSearchablePdf(input, [{
    page: 1, method: 'OCR recognition',
    words: [{ text: 'Invoice', left: 100, top: 90, width: 90, height: 25 }],
    dimensions: { width: 1200, height: 800 },
  }, { page: 2, method: 'Selectable PDF text', words: [] }]);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const result = await PDFDocument.load(bytes);
  assert.equal(result.getPageCount(), 2);
  assert.equal(result.getPages()[0].getWidth(), 600);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
  try {
    const pdf = await task.promise;
    const first = await (await pdf.getPage(1)).getTextContent();
    const second = await (await pdf.getPage(2)).getTextContent();
    assert.match(first.items.map(i=>i.str).join(' '), /Invoice/);
    assert.match(second.items.map(i=>i.str).join(' '), /Original selectable content/);
  } finally {
    await task.destroy();
  }
});

test('searchable PDF export never invents OCR positions or processes rotated pages silently', async () => {
  const source = await PDFDocument.create();
  source.addPage([200, 300]);
  const bytes = new Blob([await source.save()]);
  await assert.rejects(makeSearchablePdf(bytes, []), /No positioned OCR/);
  await assert.rejects(makeSearchablePdf(bytes, [{
    page: 2, method: 'OCR recognition',
    words: [{ text: 'test', left: 1, top: 1, height: 10 }],
    dimensions: { width: 200, height: 300 },
  }]), /Invalid OCR page/);
});
