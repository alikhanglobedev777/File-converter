const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { upload, fileUploadError } = require('../routes/user-files-route');
const { validateSavedFile, MAX_FILE_BYTES } = require('../services/user-file-vault');

function testFileRoute() {
  const app = express();
  app.post('/upload', (req, res) => {
    upload(req, res, err => {
      if (err) {
        const result = fileUploadError(err);
        return res.status(result.status).json({ error: result.error, code: err.code || 'PARSE_FAILURE' });
      }
      const file = validateSavedFile(req.file);
      if (!file) return res.status(415).json({ error: 'Unsupported or damaged file' });
      return res.status(201).json({ size: file.size, filename: file.name, mime: file.mime });
    });
  });
  return app;
}

async function serve(fn) {
  const app = testFileRoute();
  const server = await new Promise(resolve => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  try {
    await fn('http://127.0.0.1:' + server.address().port + '/upload');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function samplePdf(size = 30 * 1024) {
  const header = Buffer.from('%PDF-1.7\n');
  const trailer = Buffer.from('\n%%EOF\n');
  return Buffer.concat([header, Buffer.alloc(size - header.length - trailer.length, 0x20), trailer]);
}
function asForm(filename, data, { metadata = false } = {}) {
  const form = new FormData();
  form.append('file', new Blob([data], { type: 'application/pdf' }), filename);
  if (metadata) form.append('source', 'My Files browser upload');
  return form;
}

test('authenticated-file multipart parser accepts a real 30 KB browser file upload', async () => {
  await serve(async url => {
    const response = await fetch(url, { method: 'POST', body: asForm('sample.pdf', samplePdf()) });
    const data = await response.json();
    assert.equal(response.status, 201, JSON.stringify(data));
    assert.equal(data.size, 30720);
    assert.equal(data.filename, 'sample.pdf');
    assert.equal(data.mime, 'application/pdf');
  });
});

test('small uploaded files with one harmless multipart field are still parsed', async () => {
  await serve(async url => {
    const response = await fetch(url, {
      method: 'POST',
      body: asForm('small.pdf', samplePdf(), { metadata: true }),
    });
    assert.equal(response.status, 201, await response.text());
  });
});

test('file size limit remains exactly 5 MB and returns an accurate size error', async () => {
  await serve(async url => {
    const response = await fetch(url, {
      method: 'POST', body: asForm('large.pdf', samplePdf(MAX_FILE_BYTES + 1)),
    });
    const result = await response.json();
    assert.equal(response.status, 413, JSON.stringify(result));
    assert.equal(result.code, 'LIMIT_FILE_SIZE');
    assert.match(result.error, /exceeds the 5 MB limit/i);
  });
});

test('multipart parsing rejects multiple file streams and malformed uploads', async () => {
  await serve(async url => {
    const data = samplePdf(30 * 1024);
    const multiple = asForm('first.pdf', data);
    multiple.append('file', new Blob([data]), 'second.pdf');
    const response = await fetch(url, { method: 'POST', body: multiple });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.match(result.code, /LIMIT_FILE_COUNT|LIMIT_UNEXPECTED_FILE|LIMIT_PART_COUNT/);

    const invalid = await fetch(url, {
      method: 'POST', body: asForm('fake.pdf', Buffer.from('not a real PDF')),
    });
    assert.equal(invalid.status, 415, await invalid.text());
  });
});

test('other multipart failure codes do not falsely claim the file is too large', () => {
  assert.deepEqual(fileUploadError({ code: 'LIMIT_FILE_SIZE' }), {
    status: 413, error: 'This file exceeds the 5 MB limit.',
  });
  assert.match(fileUploadError({ code: 'LIMIT_UNEXPECTED_FILE' }).error, /one file/i);
  assert.doesNotMatch(fileUploadError(new Error('other')).error, /5 MB/);
});
