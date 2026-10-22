const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const { Readable } = require('node:stream');
const User = require('../model/user');
const { protect } = require('../middleware/authMiddleware');
const { createRateLimiter, createConcurrencyLimiter } = require('../middleware/conversion-guard');
const {
  MAX_FILE_BYTES, MAX_USER_BYTES, MAX_USER_FILES, MAX_GLOBAL_BYTES,
  validateSavedFile, validateRename, cleanFilename, safeDownloadDisposition, ALLOWED,
} = require('../services/user-file-vault');

const router = express.Router();
const bucketName = 'ak_saved_files';
// Allow a little multipart envelope headroom for browsers/proxies while
// keeping actual file bytes, file count, field bytes and total parts bounded.
// The old fields:0 / parts:1 was unnecessarily strict for small uploads.
const upload = multer({ storage: multer.memoryStorage(), limits: {
  fileSize: MAX_FILE_BYTES,
  files: 1,
  fields: 2,
  parts: 3,
  fieldSize: 1024,
  fieldNameSize: 40,
  headerPairs: 50,
}}).single('file');

function fileUploadError(err) {
  if (!err) return null;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, error: 'This file exceeds the 5 MB limit.' };
  }
  if (['LIMIT_FILE_COUNT', 'LIMIT_UNEXPECTED_FILE', 'LIMIT_PART_COUNT',
    'LIMIT_FIELD_COUNT', 'LIMIT_FIELD_VALUE', 'LIMIT_FIELD_KEY'].includes(err.code)) {
    return { status: 400, error: 'Please select one file and try again.' };
  }
  return { status: 400, error: 'This upload could not be read. Please try again.' };
}
const validId = id => mongoose.isValidObjectId(id);
function store() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Database unavailable');
  return {
    db, bucket: new mongoose.mongo.GridFSBucket(db, { bucketName }),
    files: db.collection(bucketName + '.files'),
    quotas: db.collection('ak_file_vault_quota'),
  };
}
function renderItem(item) {
  return { id: String(item._id), name: item.filename,
    bytes: item.length, createdAt: item.uploadDate, mime: item.metadata?.mime || 'application/octet-stream' };
}
const resolveOwnerFile = async (files, ownerId, id) => {
  if (!validId(id)) return null;
  return files.findOne({ _id: new mongoose.Types.ObjectId(id), 'metadata.ownerId': ownerId });
};
async function adjustAccount(userId, deltaSize, deltaCount) {
  await User.updateOne({ _id: userId }, { $inc: {
    savedFileBytes: deltaSize, savedFileCount: deltaCount,
  } });
}
async function adjustGlobal(quotas, deltaSize) {
  await quotas.updateOne({ _id: 'global' }, { $inc: { used: deltaSize } });
}
async function reserveQuota(quotas, ownerId, size) {
  // Atomic per-account reservation stops parallel uploads exceeding a user's
  // limits. Quota counters are reserved before GridFS receives file bytes.
  const reserved = await User.updateOne({
    _id: ownerId,
    $expr: { $and: [
      { $lt: [{ $ifNull: ['$savedFileCount', 0] }, MAX_USER_FILES] },
      { $lte: [{ $add: [{ $ifNull: ['$savedFileBytes', 0] }, size] }, MAX_USER_BYTES] },
    ] },
  }, { $inc: { savedFileCount: 1, savedFileBytes: size } });
  if (!reserved.matchedCount) return { ok: false, reason: 'account' };
  try {
    await quotas.updateOne({ _id: 'global' }, { $setOnInsert: { used: 0 } }, { upsert: true });
    const result = await quotas.updateOne({
      _id: 'global', used: { $lte: MAX_GLOBAL_BYTES - size },
    }, { $inc: { used: size } });
    if (!result.matchedCount) {
      await adjustAccount(ownerId, -size, -1);
      return { ok: false, reason: 'global' };
    }
    return { ok: true };
  } catch (error) {
    await adjustAccount(ownerId, -size, -1).catch(() => {});
    throw error;
  }
}
router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { files } = store();
    const owner = req.user._id;
    const documents = await files.find({ 'metadata.ownerId': owner })
      .sort({ uploadDate: -1 }).limit(MAX_USER_FILES + 1).toArray();
    return res.set('Cache-Control', 'no-store').json({
      items: documents.map(renderItem),
      limits: { count: MAX_USER_FILES, bytes: MAX_USER_BYTES, perFileBytes: MAX_FILE_BYTES },
      usedBytes: documents.reduce((sum, document) => sum + document.length, 0),
    });
  } catch {
    return res.status(503).json({ error: 'Your private files are temporarily unavailable.' });
  }
});

router.post('/', createRateLimiter({ limit: 12 }), createConcurrencyLimiter({ limit: 2 }), (req, res) => {
  upload(req, res, async err => {
    if (err) {
      // No filename, token, document content or form data in application logs.
      console.warn('Private file multipart upload rejected', { code: err.code || 'PARSE_FAILURE' });
      const failure = fileUploadError(err);
      return res.status(failure.status).json({ error: failure.error });
    }
    const checked = validateSavedFile(req.file);
    if (!checked) return res.status(400).json({ error: 'Unsupported or damaged file. Use PDF, JPG, PNG, WebP, DOCX, XLSX, PPTX, ZIP, or UTF-8 TXT (max 5 MB).' });
    let resources;
    let reserved = false;
    try {
      resources = store();
      const attempt = await reserveQuota(resources.quotas, req.user._id, checked.size);
      if (!attempt.ok) return res.status(413).json({
        error: attempt.reason === 'global'
          ? 'File storage is currently full. Please try again later.'
          : 'Private file limit reached (10 files / 25 MB). Delete files to free space.',
      });
      reserved = true;
      const stream = resources.bucket.openUploadStream(checked.name, {
        contentType: checked.mime,
        metadata: { ownerId: req.user._id, mime: checked.mime },
      });
      try {
        await new Promise((resolve, reject) => {
          stream.once('finish', resolve);
          stream.once('error', reject);
          Readable.from([req.file.buffer]).pipe(stream);
        });
      } catch (uploadError) {
        await stream.abort().catch(() => {});
        throw uploadError;
      }
      return res.status(201).set('Cache-Control','no-store')
        .json({ saved: true, item: { id: String(stream.id), name: checked.name, bytes: checked.size, mime: checked.mime } });
    } catch {
      if (reserved && resources) {
        await Promise.allSettled([
          adjustAccount(req.user._id, -checked.size, -1),
          adjustGlobal(resources.quotas, -checked.size),
        ]);
      }
      return res.status(503).json({ error: 'Could not save this file. Please retry.' });
    }
  });
});

router.get('/:id/download', async (req, res) => {
  try {
    const { files, bucket } = store();
    const item = await resolveOwnerFile(files, req.user._id, req.params.id);
    if (!item) return res.status(404).json({ error: 'File not found.' });
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': ALLOWED[(cleanFilename(item.filename) || '').split('.').at(-1)?.toLowerCase()] || 'application/octet-stream',
      'Content-Disposition': safeDownloadDisposition(item.filename),
      'Content-Length': String(item.length),
    });
    const stream = bucket.openDownloadStream(item._id);
    stream.once('error', () => {
      if (!res.headersSent) res.status(503).json({ error: 'Unable to download file.' });
      else res.destroy();
    });
    return stream.pipe(res);
  } catch {
    return res.status(503).json({ error: 'Unable to download file.' });
  }
});

router.patch('/:id', express.json({ limit: '1kb' }), async (req, res) => {
  try {
    const { files } = store();
    const item = await resolveOwnerFile(files, req.user._id, req.params.id);
    if (!item) return res.status(404).json({ error: 'File not found.' });
    const name = validateRename(item.filename, req.body?.name);
    if (!name) return res.status(400).json({ error: 'Choose a valid filename with the same extension.' });
    await files.updateOne({ _id: item._id, 'metadata.ownerId': req.user._id }, { $set: { filename: name } });
    return res.json({ renamed: true, name });
  } catch {
    return res.status(503).json({ error: 'Could not rename file.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { files, bucket, quotas } = store();
    const item = await resolveOwnerFile(files, req.user._id, req.params.id);
    if (!item) return res.status(404).json({ error: 'File not found.' });
    await bucket.delete(item._id);
    await Promise.allSettled([
      adjustAccount(req.user._id, -item.length, -1),
      adjustGlobal(quotas, -item.length),
    ]);
    return res.json({ deleted: true });
  } catch {
    return res.status(503).json({ error: 'Could not delete file.' });
  }
});

module.exports = { router, reserveQuota, renderItem, resolveOwnerFile, upload, fileUploadError };
