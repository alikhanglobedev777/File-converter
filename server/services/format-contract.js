// The extension, media type, and magic bytes must agree before a download is sent.
// Office formats are ZIP containers, but they must keep their distinct extensions.
const fs = require('node:fs/promises');
const path = require('node:path');

const formats = Object.freeze({
  'pdf-to-excel': ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'pdf-to-word': ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'pdf-to-jpg': ['jpg', 'image/jpeg'],
  'pdf-to-ppt': ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'excel-to-pdf': ['pdf', 'application/pdf'],
  'excel-to-word': ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'excel-to-ppt': ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  'pdf-merger': ['pdf', 'application/pdf'],
  'zip-maker': ['zip', 'application/zip'],
});
const zipFormats = new Set(['zip', 'xlsx', 'docx', 'pptx']);

class OutputFormatError extends Error {
  constructor(message) { super(message); this.name = 'OutputFormatError'; }
}

function isZipHeader(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));
}

function hasZipEndRecord(bytes) {
  // EOCD is 22 bytes plus an optional maximum 65,535-byte archive comment.
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 5 && bytes[i + 3] === 6) {
      const commentSize = bytes.readUInt16LE(i + 20);
      if (i + 22 + commentSize === bytes.length) return true;
    }
  }
  return false;
}

async function verifyOutputFormat(service, filename) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  const [expectedExtension, contentType] = formats[service] || [];
  if (!expectedExtension || extension !== expectedExtension) {
    throw new OutputFormatError(`Unexpected output extension from ${service}`);
  }
  const handle = await fs.open(filename, 'r');
  try {
    const stat = await handle.stat();
    if (stat.size < 4) throw new OutputFormatError('Output file is empty or truncated');
    const magic = Buffer.alloc(8);
    await handle.read(magic, 0, Math.min(8, stat.size), 0);
    const valid = extension === 'pdf' ? magic.subarray(0, 5).toString() === '%PDF-'
      : extension === 'jpg' ? magic[0] === 0xff && magic[1] === 0xd8 && magic[2] === 0xff
      : zipFormats.has(extension) && isZipHeader(magic);
    if (!valid) throw new OutputFormatError(`${service} returned content that is not ${extension.toUpperCase()}`);
    if (extension === 'jpg') {
      const end = Buffer.alloc(2);
      await handle.read(end, 0, 2, stat.size - 2);
      if (end[0] !== 0xff || end[1] !== 0xd9) {
        throw new OutputFormatError('Generated JPG file is incomplete');
      }
    }
    if (zipFormats.has(extension)) {
      const tailSize = Math.min(stat.size, 65557);
      const tail = Buffer.alloc(tailSize);
      await handle.read(tail, 0, tailSize, stat.size - tailSize);
      if (!hasZipEndRecord(tail)) throw new OutputFormatError('Generated ZIP-based file is incomplete');
    }
    return { extension, contentType };
  } finally { await handle.close(); }
}

module.exports = { verifyOutputFormat, OutputFormatError };
