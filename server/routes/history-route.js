const express = require('express');
const mongoose = require('mongoose');
const ConversionHistory = require('../model/conversion-history');
const { protect } = require('../middleware/authMiddleware');
const { retentionDays } = require('../services/conversion-history');

const router = express.Router();
router.use(protect);

router.get('/', async (req, res) => {
  const parsed = Number(req.query.page || 1);
  const page = Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 100000) : 1;
  const limit = 20;
  const filter = { userId: req.user._id };
  try {
    const [items, total, successful, failed] = await Promise.all([
      ConversionHistory.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ConversionHistory.countDocuments(filter),
      ConversionHistory.countDocuments({ ...filter, status: 'success' }),
      ConversionHistory.countDocuments({ ...filter, status: 'failed' }),
    ]);
    return res.json({ items, total, successful, failed, page, totalPages: Math.max(1, Math.ceil(total / limit)), retentionDays: retentionDays() });
  } catch {
    return res.status(503).json({ error: 'History is temporarily unavailable. Please try again.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid history record.' });
  try {
    const result = await ConversionHistory.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: 'History record not found.' });
    return res.json({ deleted: true });
  } catch {
    return res.status(503).json({ error: 'Could not delete history right now.' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const result = await ConversionHistory.deleteMany({ userId: req.user._id });
    return res.json({ deletedCount: result.deletedCount });
  } catch {
    return res.status(503).json({ error: 'Could not clear history right now.' });
  }
});

module.exports = router;
