// Tesseract's opt-in TSV output provides word bounding boxes in canvas pixels.
// These are not persisted or sent to AK Converter; only the generated PDF is saved.
export function parseOcrTsv(tsv, maxWords = 2500) {
  if (typeof tsv !== 'string' || !tsv) return [];
  const rows = tsv.split(/\r?\n/).slice(1);
  const words = [];
  for (const row of rows) {
    if (words.length >= maxWords) break;
    const columns = row.split('\t');
    if (columns.length < 12 || columns[0] !== '5') continue;
    const [left, top, width, height] = columns.slice(6, 10).map(Number);
    const text = columns.slice(11).join('\t').trim().slice(0, 120);
    if (!text || ![left, top, width, height].every(Number.isFinite) ||
        left < 0 || top < 0 || width <= 0 || height <= 0) continue;
    words.push({ text, left, top, width, height });
  }
  return words;
}

export async function makeSearchablePdf(file, analyzedPages) {
  if (!file || !Array.isArray(analyzedPages)) throw new Error('Invalid OCR document');
  const overlays = analyzedPages.filter(item =>
    item.method === 'OCR recognition' && item.words?.length && item.dimensions);
  if (!overlays.length) throw new Error('No positioned OCR words available for a searchable PDF');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()), {
    updateMetadata: false,
  });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const documentPages = pdf.getPages();
  let inserted = 0;
  for (const source of overlays) {
    if (!Number.isInteger(source.page) || source.page < 1 || source.page > documentPages.length ||
        source.words.length > 2500) throw new Error('Invalid OCR page position');
    const page = documentPages[source.page - 1];
    // Rotated pages require coordinate transforms that this initial release
    // does not guess. Prevent invisible text from being misplaced.
    if ((page.getRotation().angle || 0) % 360 !== 0) {
      throw new Error('Searchable PDF export currently supports unrotated pages only');
    }
    const { width, height } = page.getSize();
    const bitmap = source.dimensions;
    if (!(bitmap.width > 0 && bitmap.height > 0)) throw new Error('Invalid OCR image dimensions');
    const factorX = width / bitmap.width;
    const factorY = height / bitmap.height;
    for (const word of source.words) {
      if (!Number.isFinite(word.left) || !Number.isFinite(word.top) ||
          !Number.isFinite(word.height) || word.left < 0 || word.top < 0 ||
          word.left > bitmap.width || word.top > bitmap.height || word.height <= 0) continue;
      // Helvetica only supports WinAnsi; avoid unsupported glyph crashes.
      const text = String(word.text || '').normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '');
      if (!text || text.length > 120) continue;
      const size = Math.max(4, Math.min(60, word.height * factorY * 0.85));
      page.drawText(text, {
        x: Math.min(width - 1, word.left * factorX),
        y: Math.max(0, Math.min(height - 1, height - (word.top + word.height) * factorY)),
        font, size, opacity: 0, color: rgb(0, 0, 0),
      });
      inserted++;
    }
  }
  if (!inserted) throw new Error('No valid recognized words for searchable PDF export');
  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}


// Phone photos are not PDFs. Build a new one-page PDF locally with the
// downscaled camera image as a visible background and extracted word positions
// as an invisible searchable layer. No image is uploaded to the backend.
export async function makeSearchablePdfFromPhoto(photo, recognized) {
  if (!photo || !['image/jpeg', 'image/png'].includes(photo.type) ||
      !recognized || !Array.isArray(recognized.words) || !recognized.words.length ||
      recognized.words.length > 2500 || !recognized.dimensions) {
    throw new Error('Recognize a supported photo before searchable PDF export');
  }
  const dims = recognized.dimensions;
  if (!Number.isFinite(dims.width) || !Number.isFinite(dims.height) ||
      dims.width < 1 || dims.height < 1) throw new Error('Invalid photo size');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const img = photo.type === 'image/png'
    ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  const factor = Math.min(1, 842 / dims.width, 842 / dims.height);
  const width = dims.width * factor;
  const height = dims.height * factor;
  const page = pdf.addPage([width, height]);
  page.drawImage(img, { x: 0, y: 0, width, height });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let added = 0;
  for (const word of recognized.words) {
    if (!word || ![word.left, word.top, word.height].every(Number.isFinite) ||
        word.left < 0 || word.top < 0 || word.height <= 0 ||
        word.left >= dims.width || word.top >= dims.height) continue;
    const text = String(word.text || '').normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '').slice(0, 120);
    if (!text) continue;
    page.drawText(text, {
      x: Math.max(0, Math.min(width - 1, word.left * factor)),
      y: Math.max(0, Math.min(height - 1, height - (word.top + word.height) * factor)),
      size: Math.max(4, Math.min(60, word.height * factor * 0.85)),
      font, opacity: 0, color: rgb(0, 0, 0),
    });
    added++;
  }
  if (!added) throw new Error('No valid OCR words to position');
  const saved = await pdf.save();
  return new Blob([saved], { type: 'application/pdf' });
}
