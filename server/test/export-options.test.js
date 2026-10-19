const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pdfPrintOptions, imageExportOptions, ExportOptionsError } = require('../services/pdf-export-options');

test('Excel PDF defaults remain unchanged and options validate inputs', () => {
  assert.deepEqual(pdfPrintOptions(), { paperSize: 'A4', orientation: 'auto' });
  assert.deepEqual(pdfPrintOptions({ paperSize: 'LETTER', orientation: 'landscape' }), { paperSize: 'LETTER', orientation: 'landscape' });
  assert.throws(() => pdfPrintOptions({ paperSize: 'A1' }), ExportOptionsError);
  assert.throws(() => pdfPrintOptions({ orientation: 'diagonal' }), ExportOptionsError);
});

test('JPG settings preserve original default resolution and validate quality', () => {
  assert.deepEqual(imageExportOptions(), { scale: 2, quality: 90 });
  assert.deepEqual(imageExportOptions({ scale: '1.5', quality: '65' }), { scale: 1.5, quality: 65 });
  assert.throws(() => imageExportOptions({ scale: '50' }), ExportOptionsError);
  assert.throws(() => imageExportOptions({ quality: '999' }), ExportOptionsError);
});
