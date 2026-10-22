export const OCR_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const OCR_MAX_PAGES = 5;
export const OCR_MAX_PIXELS = 3_000_000;
export const OCR_TEXT_LIMIT = 120_000;

export function isSupportedOcrFile(file) {
  return !!file && /\.pdf$/i.test(file.name || '') &&
    Number.isFinite(file.size) && file.size > 0 && file.size <= OCR_MAX_FILE_BYTES;
}

export function selectedOcrPages(totalPages, count = OCR_MAX_PAGES) {
  if (!Number.isInteger(totalPages) || totalPages < 1) return [];
  return Array.from({ length: Math.min(totalPages, OCR_MAX_PAGES, Math.max(1, count)) },
    (_, index) => index + 1);
}

export function boundedPageScale(width, height, desiredScale = 2) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Invalid PDF page size');
  }
  return Math.min(desiredScale, Math.sqrt(OCR_MAX_PIXELS / (width * height)));
}

export function safeOcrText(text) {
  return String(text || '').replace(/\u0000/g, '').slice(0, OCR_TEXT_LIMIT);
}

export function assembleOcrText(pages) {
  return pages.map(({ page, text }) =>
    `--- Page ${Number(page)} ---\n${safeOcrText(text)}`
  ).join('\n\n');
}

export function textDownloadName(filename, extension = 'txt') {
  const base = String(filename || 'document').split(/[\\/]/).pop()
    .replace(/\.pdf$/i, '').replace(/[^a-z0-9_. -]/gi, '_').slice(0, 90) || 'document';
  return `${base}-ocr.${extension}`;
}
