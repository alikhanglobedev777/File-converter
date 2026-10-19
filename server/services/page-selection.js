class PageSelectionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PageSelectionError';
  }
}

function parsePositiveInt(value, label) {
  if (!/^[1-9]\d*$/.test(String(value).trim())) {
    throw new PageSelectionError(`${label} must be a positive whole number.`);
  }
  return Number.parseInt(String(value).trim(), 10);
}

function parsePageSelection(input, totalPages, { label = 'Page selection', allowDuplicates = false } = {}) {
  const raw = String(input ?? '').trim();
  if (!raw) throw new PageSelectionError(`${label} is required.`);
  const pages = [];
  const seen = new Set();
  for (const segment of raw.split(',')) {
    const token = segment.trim();
    if (!token) continue;
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number.parseInt(range[1], 10);
      const end = Number.parseInt(range[2], 10);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages || start > end) {
        throw new PageSelectionError(`${label} contains an invalid range: ${token}.`);
      }
      for (let page = start; page <= end; page++) {
        if (!allowDuplicates && seen.has(page)) continue;
        pages.push(page);
        seen.add(page);
      }
      continue;
    }

    const page = parsePositiveInt(token, label);
    if (page > totalPages) throw new PageSelectionError(`${label} refers to page ${page}, but the document has only ${totalPages} page(s).`);
    if (!allowDuplicates && seen.has(page)) continue;
    pages.push(page);
    seen.add(page);
  }
  if (!pages.length) throw new PageSelectionError(`${label} did not contain any valid pages.`);
  return pages;
}

function parseRotationInstructions(input, totalPages) {
  const raw = String(input ?? '').trim();
  if (!raw) return new Map();
  const result = new Map();
  for (const segment of raw.split(',')) {
    const token = segment.trim();
    if (!token) continue;
    const match = token.match(/^(\d+)\s*:\s*(0|90|180|270)$/);
    if (!match) {
      throw new PageSelectionError(`Rotation rules must look like "2:90,4:180". Invalid rule: ${token}.`);
    }
    const page = Number.parseInt(match[1], 10);
    const angle = Number.parseInt(match[2], 10);
    if (page < 1 || page > totalPages) {
      throw new PageSelectionError(`Rotation refers to page ${page}, but the document has only ${totalPages} page(s).`);
    }
    result.set(page, angle);
  }
  return result;
}

module.exports = { PageSelectionError, parsePageSelection, parseRotationInstructions, parsePositiveInt };
