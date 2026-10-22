// Persistent, opt-in, account-scoped storage backed by MongoDB GridFS.
// No file is auto-saved after conversion. The free-tier quotas intentionally
// protect the shared database from unbounded document retention.
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_USER_BYTES = 25 * 1024 * 1024;
const MAX_USER_FILES = 10;
const MAX_GLOBAL_BYTES = 180 * 1024 * 1024;
const ALLOWED = Object.freeze({
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  txt: 'text/plain',
});

function cleanFilename(value) {
  if (typeof value !== 'string') return null;
  const basename = value.split(/[\\/]/).at(-1)
    .replace(/[\x00-\x1f\x7f<>:"|?*]/g, '_')
    .trim().slice(0, 120);
  if (!basename || basename.startsWith('.') || !/^[^/\\]+\.[a-z0-9]{2,5}$/i.test(basename)) return null;
  const ext = basename.split('.').at(-1).toLowerCase();
  return ALLOWED[ext] ? basename : null;
}
function kindOf(name) { return String(name || '').split('.').at(-1).toLowerCase(); }
function hasZipTrailer(buffer) {
  if (buffer.length < 22) return false;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer[i] === 0x50 && buffer[i+1] === 0x4b &&
        buffer[i+2] === 0x05 && buffer[i+3] === 0x06) {
      return i + 22 + buffer.readUInt16LE(i + 20) === buffer.length;
    }
  }
  return false;
}
function isUtf8Text(buffer) {
  if (buffer.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(buffer); return true; }
  catch { return false; }
}
function validateSavedFile(file) {
  if (!file?.buffer || !Buffer.isBuffer(file.buffer) ||
      file.size < 1 || file.size > MAX_FILE_BYTES) return null;
  const name = cleanFilename(file.originalname);
  if (!name) return null;
  const ext = kindOf(name);
  const data = file.buffer;
  const starts = hex => data.subarray(0, hex.length / 2).equals(Buffer.from(hex, 'hex'));
  const result = ext === 'pdf' ? starts('255044462d') && data.lastIndexOf(Buffer.from('%%EOF')) > data.length - 2048
    : ext === 'jpg' || ext === 'jpeg' ? starts('ffd8ff') && data.subarray(-2).equals(Buffer.from('ffd9', 'hex'))
    : ext === 'png' ? starts('89504e470d0a1a0a') && data.subarray(-12).equals(Buffer.from('0000000049454e44ae426082','hex'))
    : ext === 'webp' ? data.subarray(0,4).toString() === 'RIFF' && data.subarray(8,12).toString() === 'WEBP'
    : ['docx', 'xlsx', 'pptx', 'zip'].includes(ext) ? starts('504b0304') && hasZipTrailer(data)
    : ext === 'txt' ? isUtf8Text(data)
    : false;
  return result ? { name, mime: ALLOWED[ext], size: file.size } : null;
}
function validateRename(oldName, requested) {
  const next = cleanFilename(requested);
  if (!next || kindOf(oldName) !== kindOf(next)) return null;
  return next;
}
function safeDownloadDisposition(name) {
  const file = cleanFilename(name) || 'document.pdf';
  return "attachment; filename*=UTF-8''" + encodeURIComponent(file);
}
module.exports = {
  ALLOWED, MAX_FILE_BYTES, MAX_USER_BYTES, MAX_USER_FILES, MAX_GLOBAL_BYTES,
  cleanFilename, validateSavedFile, validateRename, safeDownloadDisposition,
};
