import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDownload } from '../src/utils/downloadFormat.js';

const pdf = new Blob([Buffer.from('%PDF-1.7\nvalid PDF signature')]);
const zip = new Blob([Buffer.from('504b0506' + '00'.repeat(18), 'hex')]);
const brokenZip = new Blob([Buffer.from('504b0304' + '00'.repeat(18), 'hex')]);
const jpg = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xd9])]);
const png = new Blob([Buffer.from('89504e470d0a1a0a0000000049454e44ae426082', 'hex')]);
const resp = (mime, filename) => ({ headers: new Headers({
  'Content-Type': mime,
  'Content-Disposition': `attachment; filename="${filename}"`,
}) });

test('three merged PDFs are downloaded as one merged.pdf, never a ZIP', async () => {
  const info = await validateDownload('pdf-merger', resp('application/pdf', 'merged.pdf'), pdf, 'a.pdf');
  assert.deepEqual(info, { filename: 'merged.pdf', extension: 'pdf', mime: 'application/pdf' });
  await assert.rejects(validateDownload('pdf-merger', resp('application/zip', 'merged.zip'), zip, 'a.pdf'), /Incorrect download format/);
  await assert.rejects(validateDownload('pdf-merger', resp('application/pdf', 'merged.pdf'), zip, 'a.pdf'), /Incorrect download format/);
});

test('each converter validates correct extensions and output types', async () => {
  const cases = [
    ['pdf-to-excel', 'xlsx', zip, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['pdf-to-word', 'docx', zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['pdf-to-ppt', 'pptx', zip, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['excel-to-pdf', 'pdf', pdf, 'application/pdf'],
    ['excel-to-word', 'docx', zip, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['excel-to-ppt', 'pptx', zip, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['pdf-compressor', 'pdf', pdf, 'application/pdf'],
    ['pdf-splitter', 'pdf', pdf, 'application/pdf'],
    ['image-to-pdf', 'pdf', pdf, 'application/pdf'],
    ['pdf-organizer', 'pdf', pdf, 'application/pdf'],
    ['pdf-to-jpg', 'jpg', jpg, 'image/jpeg'],
    ['pdf-to-png', 'png', png, 'image/png'],
    ['zip-maker', 'zip', zip, 'application/zip'],
  ];
  for (const [service, ext, data, mime] of cases) {
    assert.equal((await validateDownload(service, resp(mime, `result.${ext}`), data, 'original.pdf')).extension, ext, service);
  }
});

test('PDF-to-JPG rejects ZIP bytes, ZIP filenames and ZIP media types', async () => {
  await assert.rejects(validateDownload('pdf-to-jpg', resp('application/zip', 'report.zip'), zip, 'report.pdf'), /Incorrect download format/);
  await assert.rejects(validateDownload('pdf-to-jpg', resp('image/jpeg', 'report.jpg'), zip, 'report.pdf'), /Incorrect download format/);
  await assert.rejects(validateDownload('pdf-to-jpg', resp('application/zip', 'report.jpg'), jpg, 'report.pdf'), /Content-Type/);
  await assert.rejects(validateDownload('pdf-to-jpg', resp('image/jpeg', 'report.zip'), jpg, 'report.pdf'), /incorrect extension/);
  const truncated = new Blob([Buffer.from([0xff, 0xd8, 0xff, 0xe0])]);
  await assert.rejects(validateDownload('pdf-to-jpg', resp('image/jpeg', 'report.jpg'), truncated, 'report.pdf'), /incomplete JPG/);
});

test('PDF-to-PNG rejects mislabeled and truncated output', async () => {
  assert.equal((await validateDownload('pdf-to-png', resp('image/png', 'report.png'), png, 'report.pdf')).extension, 'png');
  await assert.rejects(validateDownload('pdf-to-png', resp('image/png', 'report.png'), jpg, 'report.pdf'), /Incorrect download format/);
  await assert.rejects(validateDownload('pdf-to-png', resp('image/jpeg', 'report.png'), png, 'report.pdf'), /Content-Type/);
  await assert.rejects(validateDownload('pdf-to-png', resp('image/png', 'report.jpg'), png, 'report.pdf'), /incorrect extension/);
  await assert.rejects(validateDownload('pdf-to-png', resp('image/png', 'report.png'), new Blob([Buffer.from('89504e470d0a1a0a00000000', 'hex')]), 'report.pdf'), /incomplete PNG/);
});

test('bad MIME, wrong extension, and partial ZIP downloads are blocked', async () => {
  await assert.rejects(validateDownload('excel-to-pdf', resp('application/zip', 'result.pdf'), pdf, 'x.xlsx'), /Content-Type/);
  await assert.rejects(validateDownload('excel-to-pdf', resp('application/pdf', 'result.zip'), pdf, 'x.xlsx'), /incorrect extension/);
  await assert.rejects(validateDownload('zip-maker', resp('application/zip', 'archive.zip'), brokenZip, 'x.pdf'), /incomplete ZIP/);
});

test('a proxy with octet-stream is accepted only if the content is valid', async () => {
  assert.equal((await validateDownload('pdf-merger', resp('application/octet-stream', 'merged.pdf'), pdf)).extension, 'pdf');
  await assert.rejects(validateDownload('pdf-merger', resp('application/octet-stream', 'merged.pdf'), zip), /Incorrect download format/);
});
