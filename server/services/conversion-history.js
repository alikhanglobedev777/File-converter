const path = require('node:path');
const ConversionHistory = require('../model/conversion-history');

const DAY_MS = 24 * 60 * 60 * 1000;
function retentionDays(value = process.env.HISTORY_RETENTION_DAYS) {
  // Use 30 days unless a whole number in the allowed 1–365 day range is supplied.
  const days = Number(value);
  return typeof value === 'string' && /^\d+$/.test(value.trim()) && days >= 1 && days <= 365 ? days : 30;
}

function displayFilename(originalName) {
  const name = path.basename(String(originalName || 'file').replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (name || 'file').slice(0, 180);
}

async function recordConversion({ user, files, service, outputFormat = '', status }) {
  if (!user?._id || !Array.isArray(files) || files.length === 0) return;
  try {
    await ConversionHistory.create({
      userId: user._id,
      filename: displayFilename(files[0].originalname),
      conversionType: service,
      outputFormat: outputFormat.slice(0, 10),
      status,
      fileSize: files.reduce((total, file) => total + (file.size || 0), 0),
      fileCount: files.length,
      expiresAt: new Date(Date.now() + retentionDays() * DAY_MS),
    });
  } catch {
    // History is optional: recording failures must not interrupt conversion downloads.
    console.warn('Conversion history could not be recorded.');
  }
}

module.exports = { recordConversion, retentionDays, displayFilename };
