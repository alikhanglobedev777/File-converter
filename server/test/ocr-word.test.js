const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const { router, validateOcrPages } = require('../routes/ocr-route');
const { app } = require('../server');

test('OCR reviewed-page input is bounded, ordered and text-only', () => {
  assert.deepEqual(validateOcrPages([{ page: 1, text: 'Hello' }]), [{ page: 1, text: 'Hello' }]);
  assert.equal(validateOcrPages([]), null);
  assert.equal(validateOcrPages([{ page: 1, text: 'ok' }, { page: 1, text: 'again' }]), null);
  assert.equal(validateOcrPages([{ page: 2, text: 'ok' }, { page: 1, text: 'earlier' }]), null);
  assert.equal(validateOcrPages([{ page: 0, text: 'ok' }]), null);
  assert.equal(validateOcrPages([{ page: 1, text: 'a'.repeat(120001) }]), null);
  assert.equal(validateOcrPages([{ page: 1, text: 'ok', filename: 'bad.docx' }])?.length, 1);
  assert.equal(validateOcrPages([{ page: 1, text: 'line\n'.repeat(1501) }]), null);
  assert.equal(typeof router, 'function');
});

test('OCR Word export responds with genuine editable DOCX, no uploaded PDF', async () => {
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/api/ocr/word';
    const request = (pages) => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages }),
    });
    const invalid = await request([{ page: 1, text: null }]);
    assert.equal(invalid.status, 400);
    assert.match((await invalid.json()).error, /Review up to five/i);

    const response = await request([
      { page: 1, text: 'Scanned name: Ali\nInvoice number 1234' },
      { page: 2, text: 'A second page of recognized text.' },
    ]);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status, 200, bytes.toString().slice(0, 180));
    assert.equal(response.headers.get('content-type'),
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    assert.match(response.headers.get('content-disposition'), /recognized-text\.docx/);
    assert.equal(bytes.subarray(0, 2).toString(), 'PK');
    const zip = await JSZip.loadAsync(bytes);
    const documentXml = await zip.file('word/document.xml').async('string');
    assert.match(documentXml, /Scanned name: Ali/);
    assert.match(documentXml, /Invoice number 1234/);
    assert.match(documentXml, /second page of recognized text/);
    assert.match(documentXml, /<w:t\b/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
