const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { verifyOutputFormat, OutputFormatError } = require('../services/format-contract');
const { writeOutput } = require('../services/output');

const emptyZip = Buffer.from('504b0506' + '00'.repeat(18), 'hex');

async function tempFile(ext, buffer, run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'format-check-'));
  const file = path.join(dir, `result.${ext}`);
  try { await fs.writeFile(file, buffer); return await run(file); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('PDF merger only accepts a genuine PDF download', async () => {
  const pdf = Buffer.from('%PDF-1.7\nA test PDF');
  await tempFile('pdf', pdf, async filename => {
    assert.deepEqual(await verifyOutputFormat('pdf-merger', filename), { extension: 'pdf', contentType: 'application/pdf' });
  });
  await tempFile('pdf', emptyZip, async filename => {
    await assert.rejects(verifyOutputFormat('pdf-merger', filename), OutputFormatError);
  });
  await tempFile('zip', emptyZip, async filename => {
    await assert.rejects(verifyOutputFormat('pdf-merger', filename), OutputFormatError);
  });
});

test('all nine services have the required binary formats and MIME types', async () => {
  const cases = [
    ['pdf-to-excel', 'xlsx', emptyZip, 'spreadsheetml.sheet'],
    ['pdf-to-word', 'docx', emptyZip, 'wordprocessingml.document'],
    ['pdf-to-ppt', 'pptx', emptyZip, 'presentationml.presentation'],
    ['excel-to-pdf', 'pdf', Buffer.from('%PDF-1.7\n'), 'application/pdf'],
    ['excel-to-word', 'docx', emptyZip, 'wordprocessingml.document'],
    ['excel-to-ppt', 'pptx', emptyZip, 'presentationml.presentation'],
    ['pdf-merger', 'pdf', Buffer.from('%PDF-1.7\n'), 'application/pdf'],
    ['pdf-to-jpg', 'jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'image/jpeg'],
    ['pdf-to-jpg', 'zip', emptyZip, 'application/zip'],
    ['zip-maker', 'zip', emptyZip, 'application/zip'],
  ];
  for (const [service, extension, content, mime] of cases) {
    await tempFile(extension, content, async filename => {
      const result = await verifyOutputFormat(service, filename);
      assert.equal(result.extension, extension);
      assert.ok(result.contentType.includes(mime), `${service}: ${result.contentType}`);
    });
  }
});

test('truncated ZIP-based output is rejected', async () => {
  await tempFile('zip', Buffer.from('504b0304' + '00'.repeat(32), 'hex'), async filename => {
    await assert.rejects(verifyOutputFormat('zip-maker', filename), OutputFormatError);
  });
});

test('partially generated output files are deleted after a write failure', async () => {
  let created;
  await assert.rejects(writeOutput('pdf', async filename => {
    created = filename;
    await fs.writeFile(filename, '%PDF-1.7\npartial data');
    throw new Error('simulated write failure');
  }), /simulated write failure/);
  await assert.rejects(fs.stat(created), { code: 'ENOENT' });
});
