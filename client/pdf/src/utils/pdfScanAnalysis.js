// Lightweight local-only detection. No OCR, rendering, upload or content logging.
// These are indicators, not proof that a document is a scan.
export function classifyPdfPage({ text = '', imagePaints = 0, hasVectorArt = false } = {}) {
  const letters = String(text).replace(/\s/g, '').length;
  if (letters >= 24) return 'text';
  if (letters === 0 && imagePaints > 0) return 'likely-scanned';
  if (letters < 24 && imagePaints > 0) return 'uncertain';
  return 'uncertain';
}

export function summarizePdfPages(pages, totalPages) {
  const count = Number(totalPages);
  const samples = Array.isArray(pages) ? pages : [];
  const scanned = samples.filter(item => item.type === 'likely-scanned').length;
  const native = samples.filter(item => item.type === 'text').length;
  let type = 'uncertain';
  if (scanned && native) type = 'mixed';
  else if (scanned && scanned === samples.length && samples.length) type = 'likely-scanned';
  else if (native && native === samples.length && samples.length) type = 'text';
  return { type, pages: samples, totalPages: count, sampledPages: samples.length,
    partial: samples.length < count };
}

export function selectSamplePages(count, maxPages = 5) {
  if (!Number.isSafeInteger(count) || count < 1) return [];
  const max = Math.max(1, Math.min(5, maxPages));
  if (count <= max) return Array.from({ length: count }, (_, i) => i + 1);
  const chosen = new Set([1, count]);
  for (let i = 1; chosen.size < max && i < count; i++) {
    chosen.add(1 + Math.round(i * (count - 1) / (max - 1)));
  }
  return [...chosen].sort((a, b) => a - b);
}

export async function analyzePdf(document, OPS, { signal, maxPages = 5 } = {}) {
  const pages = [];
  for (const number of selectSamplePages(document.numPages, maxPages)) {
    if (signal?.aborted) throw new Error('Analysis cancelled');
    const page = await document.getPage(number);
    try {
      const [textContent, operations] = await Promise.all([
        page.getTextContent(), page.getOperatorList(),
      ]);
      if (signal?.aborted) throw new Error('Analysis cancelled');
      const text = textContent.items.map(item => item.str || '').join(' ');
      const rasterOps = new Set([
        OPS.paintImageXObject, OPS.paintInlineImageXObject,
        OPS.paintJpegXObject, OPS.paintImageMaskXObject,
        OPS.paintImageXObjectRepeat, OPS.paintInlineImageXObjectGroup,
      ].filter(Number.isInteger));
      const imagePaints = operations.fnArray.filter(op => rasterOps.has(op)).length;
      pages.push({ page: number, type: classifyPdfPage({ text, imagePaints }),
        hasSelectableText: text.replace(/\s/g, '').length >= 24,
        rasterImagesDetected: imagePaints > 0 });
    } finally {
      page.cleanup();
    }
  }
  return summarizePdfPages(pages, document.numPages);
}

export function diagnosticMessage(report) {
  if (!report) return '';
  const qualifier = report.partial ? 'Sampled pages suggest: ' : '';
  switch (report.type) {
    case 'likely-scanned': return qualifier + 'This PDF appears to contain scanned pages. OCR may be needed to make text editable.';
    case 'mixed': return qualifier + 'This PDF mixes selectable text and image-based pages. Some pages may need OCR.';
    case 'text': return qualifier + 'Selectable text detected. Ordinary text conversion should work without OCR.';
    default: return qualifier + 'Document type is uncertain. Scans, drawings, and blank pages can look similar.';
  }
}
