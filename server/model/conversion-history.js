const mongoose = require('mongoose');

// Only metadata is retained. Uploaded and converted files are never stored here.
const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  filename: { type: String, required: true, maxlength: 180 },
  conversionType: { type: String, required: true, maxlength: 60 },
  outputFormat: { type: String, maxlength: 10, default: '' },
  status: { type: String, enum: ['success', 'failed'], required: true },
  fileSize: { type: Number, min: 0, default: 0 },
  fileCount: { type: Number, min: 1, max: 30, default: 1 },
  expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

historySchema.index({ userId: 1, createdAt: -1 });
historySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ConversionHistory', historySchema);
