// Conservative row proposals, not automatic table recognition. Users must
// review/edit cells before requesting Excel output.
export const OCR_TABLE_MAX_ROWS = 40;
export const OCR_TABLE_MAX_COLUMNS = 8;
export const OCR_TABLE_MAX_CELL_LENGTH = 256;

export function proposeOcrTable(text, delimiter = 'auto') {
  const separators = {
    auto: /\t+| {2,}/,
    tabs: /\t+/,
    commas: /,/,
    spaces: /\s+/,
  };
  const split = separators[delimiter] || separators.auto;
  return String(text || '').split(/\r?\n/).map(line => line.trim())
    .filter(Boolean).slice(0, OCR_TABLE_MAX_ROWS)
    .map(line => line.split(split).slice(0, OCR_TABLE_MAX_COLUMNS)
      .map(cell => cell.trim().slice(0, OCR_TABLE_MAX_CELL_LENGTH)));
}

export function ocrTableHasContent(rows) {
  return Array.isArray(rows) && rows.some(row =>
    Array.isArray(row) && row.some(cell => String(cell || '').trim().length > 0));
}
