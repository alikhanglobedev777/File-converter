const express = require('express');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const ExcelJS = require('exceljs');
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

function validateOcrTables(payload) {
  if (!Array.isArray(payload) || !payload.length || payload.length > MAX_PAGES) return null;
  let total = 0, lastPage = 0;
  const result = [];
  for (const table of payload) {
    if (!table || !Number.isInteger(table.page) || table.page <= lastPage ||
        table.page > 10000 || !Array.isArray(table.rows) ||
        !table.rows.length || table.rows.length > 100) return null;
    lastPage = table.page;
    const rows = [];
    for (const row of table.rows) {
      if (!Array.isArray(row) || row.length < 1 || row.length > 12) return null;
      const cells = [];
      for (const cell of row) {
        if (typeof cell !== 'string' || cell.length > 256 || cell.includes('\u0000')) return null;
        total += cell.length;
        if (total > MAX_TOTAL_CHARS) return null;
        cells.push(cell);
      }
      rows.push(cells);
    }
    result.push({ page: table.page, rows });
  }
  return result;
}

// Explicit user action; only edited cell values are sent, not the scanned PDF.
// All cells are written as literal strings, NEVER interpreted as formulas.
router.post('/excel', async (req, res) => {
  const tables = validateOcrTables(req.body?.tables);
  if (!tables) return res.status(400).json({ error: 'Review up to five OCR tables before Excel export.' });
  try {
    const book = new ExcelJS.Workbook();
    for (const table of tables) {
      const sheet = book.addWorksheet('Page ' + table.page);
      for (const row of table.rows) {
        sheet.addRow(row.map(value => {
          // ExcelJS strings already use an explicit string cell type. Prefix
          // formula-like strings as an additional spreadsheet-injection guard.
          return /^[=+\-@]/.test(value) ? "'" + value : value;
        }));
      }
      sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }];
      sheet.getRow(1).font = { bold: true };
      for (const column of sheet.columns) column.width = 22;
    }
    const file = Buffer.from(await book.xlsx.writeBuffer());
    if (file.length < 50 || file[0] !== 0x50 || file[1] !== 0x4b) throw new Error('Invalid Excel output');
    return res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="reviewed-ocr-tables.xlsx"',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    }).send(file);
  } catch (error) {
    console.error('OCR Excel export failed', { name: error?.name });
    return res.status(500).json({ error: 'Could not create Excel. Please reduce the number of rows.' });
  }
});

module.exports = { router, validateOcrPages, validateOcrTables, MAX_PAGES, MAX_TOTAL_CHARS };
