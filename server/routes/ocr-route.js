const express = require('express');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { buildConversionGuardFromEnv } = require('../middleware/conversion-guard');

const router = express.Router();
const MAX_PAGES = 5;
const MAX_TOTAL_CHARS = 200_000;
const MAX_PAGE_CHARS = 120_000;
const MAX_LINES_PER_PAGE = 1500;

function validateOcrPages(payload) {
  if (!Array.isArray(payload) || !payload.length || payload.length > MAX_PAGES) return null;
  let total = 0;
  const normalized = [];
  for (const item of payload) {
    if (!item || !Number.isSafeInteger(item.page) || item.page < 1 ||
        typeof item.text !== 'string' || item.text.length > MAX_PAGE_CHARS ||
        item.text.includes('\u0000') || item.text.split('\n').length > MAX_LINES_PER_PAGE) return null;
    total += item.text.length;
    if (total > MAX_TOTAL_CHARS) return null;
    if (normalized.some(other => other.page === item.page)) return null;
    normalized.push({ page: item.page, text: item.text });
  }
  if (normalized.some((entry, index) => index && entry.page <= normalized[index - 1].page)) return null;
  return normalized;
}

// Separate opt-in endpoint; the original scanned PDF never touches this route.
// Text is used in memory to produce an editable Office document; do not log it.
router.use(...buildConversionGuardFromEnv());
router.post('/word', async (req, res) => {
  const pages = validateOcrPages(req.body?.pages);
  if (!pages) {
    return res.status(400).json({ error: 'Review up to five OCR pages (200,000 characters total) before Word export.' });
  }
  try {
    const sections = pages.map(({ page, text }) => ({
      children: [
        new Paragraph({ text: 'Page ' + page, heading: HeadingLevel.HEADING_2 }),
        ...text.replace(/\r\n/g, '\n').split('\n').map(line => new Paragraph({
          children: [new TextRun({ text: line })],
        })),
      ],
    }));
    const file = await Packer.toBuffer(new Document({ sections }));
    if (file.length < 50 || file[0] !== 0x50 || file[1] !== 0x4b) {
      throw new Error('Word export produced an invalid file');
    }
    return res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="recognized-text.docx"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(file);
  } catch (error) {
    // Never include OCR document text or provider internals in logs.
    console.error('OCR Word export failed', { name: error?.name });
    return res.status(500).json({ error: 'Could not create the Word document. Please retry with fewer pages.' });
  }
});

module.exports = { router, validateOcrPages, MAX_PAGES, MAX_TOTAL_CHARS };
