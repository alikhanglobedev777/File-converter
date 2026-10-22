const test = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('../server');
const {
  ALLOWED, MAX_FILE_BYTES, MAX_USER_BYTES, MAX_USER_FILES, MAX_GLOBAL_BYTES,
  cleanFilename, validateSavedFile, validateRename, safeDownloadDisposition,
} = require('../services/user-file-vault');

const file = (name, buffer) => ({ originalname: name, buffer, size: buffer.length });
test('private vault supports safe document extensions, quotas and sanitized names', () => {
  assert.equal(MAX_FILE_BYTES, 5 * 1024 * 1024);
  assert.equal(MAX_USER_BYTES, 25 * 1024 * 1024);
  assert.equal(MAX_USER_FILES, 10);
  assert.ok(MAX_GLOBAL_BYTES < 200 * 1024 * 1024);
  assert.equal(cleanFilename('../../invoice.PDF'), 'invoice.PDF');
  assert.equal(cleanFilename('receipt.png'), 'receipt.png');
  assert.equal(cleanFilename('script.js'), null);
  assert.equal(cleanFilename('evil.svg'), null);
  assert.equal(cleanFilename('.env'), null);
  assert.equal(validateRename('scan.pdf', 'other.pdf'), 'other.pdf');
  assert.equal(validateRename('scan.pdf', 'other.html'), null);
  assert.equal(validateRename('scan.pdf', 'other.png'), null);
  assert.match(safeDownloadDisposition('My file.pdf'), /attachment; filename\*=UTF-8''My%20file\.pdf/);
  assert.equal(Object.keys(ALLOWED).length, 10);
});

test('upload validator confirms real bytes and rejects disguised executables or damaged files', () => {
  const pdf = Buffer.from('%PDF-1.7\nA document\n%%EOF\n');
  assert.equal(validateSavedFile(file('scan.pdf', pdf))?.mime, 'application/pdf');
  assert.equal(validateSavedFile(file('scan.jpg', pdf)), null);
  assert.equal(validateSavedFile(file('scan.png', pdf)), null);
  assert.equal(validateSavedFile(file('script.svg', Buffer.from('<svg/>'))), null);
  const jpeg = Buffer.from('ffd8ff112233ffd9','hex');
  assert.equal(validateSavedFile(file('photo.jpeg', jpeg))?.mime, 'image/jpeg');
  const png = Buffer.from('89504e470d0a1a0a0000000049454e44ae426082','hex');
  assert.equal(validateSavedFile(file('photo.png', png))?.mime, 'image/png');
  assert.equal(validateSavedFile(file('photo.png', png.subarray(0, 12))), null);
  const emptyZip = Buffer.concat([
    Buffer.from('504b0304','hex'),
    Buffer.from('504b0506' + '00'.repeat(18), 'hex'),
  ]);
  assert.equal(validateSavedFile(file('book.xlsx', emptyZip))?.mime, ALLOWED.xlsx);
  assert.equal(validateSavedFile(file('slides.pptx', emptyZip))?.mime, ALLOWED.pptx);
  assert.equal(validateSavedFile(file('archive.zip', emptyZip))?.mime, ALLOWED.zip);
  assert.equal(validateSavedFile(file('code.docx', Buffer.from('<script>'))), null);
  assert.equal(validateSavedFile(file('notes.txt', Buffer.from('Review this OCR text.')))?.mime, 'text/plain');
  assert.equal(validateSavedFile(file('binary.txt', Buffer.from([0, 1, 2]))), null);
  assert.equal(validateSavedFile(file('bad.txt', Buffer.from([0xff,0xfe]))), null);
  assert.equal(validateSavedFile(file('huge.pdf', Buffer.alloc(MAX_FILE_BYTES + 1))), null);
});

test('private vault refuses every anonymous listing, download, upload, rename or deletion', async () => {
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    const base = 'http://127.0.0.1:' + server.address().port + '/api/files';
    for (const [path, method] of [
      ['', 'GET'], ['/507f1f77bcf86cd799439011/download', 'GET'],
      ['', 'POST'], ['/507f1f77bcf86cd799439011', 'PATCH'],
      ['/507f1f77bcf86cd799439011', 'DELETE'],
    ]) {
      const response = await fetch(base + path, { method });
      assert.equal(response.status, 401, method + ' ' + path);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
