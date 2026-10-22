class ExportOptionsError extends Error {
  constructor(message) { super(message); this.name = 'ExportOptionsError'; }
}

function pdfPrintOptions({ paperSize = 'A4', orientation = 'auto' } = {}) {
  if (!['A4', 'LETTER'].includes(paperSize)) {
    throw new ExportOptionsError('Paper size must be A4 or Letter.');
  }
  if (!['auto', 'portrait', 'landscape'].includes(orientation)) {
    throw new ExportOptionsError('Orientation must be auto, portrait, or landscape.');
  }
  return { paperSize: paperSize === 'LETTER' ? 'LETTER' : 'A4', orientation };
}

function imageExportOptions({ scale = '2', quality = '90' } = {}) {
  const parsedScale = Number(scale);
  const parsedQuality = Number(quality);
  if (!['1', '1.5', '2'].includes(String(scale)) || !Number.isFinite(parsedScale)) {
    throw new ExportOptionsError('JPG resolution must be 1, 1.5, or 2.');
  }
  if (!['65', '80', '90'].includes(String(quality)) || !Number.isFinite(parsedQuality)) {
    throw new ExportOptionsError('JPG quality must be 65, 80, or 90.');
  }
  return { scale: parsedScale, quality: parsedQuality };
}

function pngExportOptions({ scale = '2' } = {}) {
  if (!['1', '1.5', '2'].includes(String(scale))) {
    throw new ExportOptionsError('PNG resolution must be 1, 1.5, or 2.');
  }
  return { scale: Number(scale) };
}

module.exports = { pdfPrintOptions, imageExportOptions, pngExportOptions, ExportOptionsError };
