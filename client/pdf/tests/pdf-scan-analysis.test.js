import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPdfPage, selectSamplePages, summarizePdfPages, analyzePdf, diagnosticMessage } from '../src/utils/pdfScanAnalysis.js';

test('scanned classification is conservative and never treats blank drawings as scans', () => {
  assert.equal(classifyPdfPage({ text: 'A full page of actual selectable text', imagePaints: 1 }), 'text');
  assert.equal(classifyPdfPage({ text: '', imagePaints: 1 }), 'likely-scanned');
  assert.equal(classifyPdfPage({ text: '', imagePaints: 0, hasVectorArt: true }), 'uncertain');
  assert.equal(classifyPdfPage({ text: 'A', imagePaints: 2 }), 'uncertain');
});

test('at most five pages are sampled across the document', () => {
  assert.deepEqual(selectSamplePages(1), [1]);
  assert.deepEqual(selectSamplePages(3), [1, 2, 3]);
  const sampled = selectSamplePages(300);
  assert.equal(sampled.length, 5);
  assert.equal(sampled[0], 1);
  assert.equal(sampled.at(-1), 300);
  assert.equal(new Set(sampled).size, 5);
});

test('mixed, text and likely scanned states use documented sampling uncertainty', () => {
  const mixed = summarizePdfPages([
    { page: 1, type: 'text' }, { page: 2, type: 'likely-scanned' },
  ], 10);
  assert.equal(mixed.type, 'mixed');
  assert.equal(mixed.partial, true);
  assert.match(diagnosticMessage(mixed), /sampled pages/i);
  assert.equal(summarizePdfPages([{ type: 'text' }], 1).type, 'text');
  assert.equal(summarizePdfPages([{ type: 'likely-scanned' }], 1).type, 'likely-scanned');
});

test('PDF worker scans text and raster ops, and always releases page resources', async () => {
  let cleanup = 0;
  const OPS = { paintImageXObject: 10, paintInlineImageXObject: 11 };
  const pages = [
    { getTextContent: async () => ({ items: [{ str: 'A lengthy ordinary selectable paragraph in the PDF' }] }),
      getOperatorList: async () => ({ fnArray: [] }), cleanup: () => { cleanup++; } },
    { getTextContent: async () => ({ items: [] }),
      getOperatorList: async () => ({ fnArray: [10] }), cleanup: () => { cleanup++; } },
  ];
  const report = await analyzePdf({ numPages: 2, getPage: async n => pages[n - 1] }, OPS);
  assert.equal(report.type, 'mixed');
  assert.equal(report.sampledPages, 2);
  assert.equal(cleanup, 2);
});

test('unsupported or unreadable PDFs fail independently of the preview', async () => {
  const badPage = { getTextContent: async () => { throw new Error('bad pdf'); },
    getOperatorList: async () => ({ fnArray: [] }), cleanup() { this.cleaned = true; } };
  await assert.rejects(analyzePdf({ numPages: 1, getPage: async () => badPage }, {}), /bad pdf/);
  assert.equal(badPage.cleaned, true);
});
