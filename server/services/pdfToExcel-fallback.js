const ExcelJS = require('exceljs');
const { writeOutput } = require('./output');
const { openPdf, renderPage } = require('./pdf-layout');

// A fail-safe for valid PDFs whose drawing instructions cannot be reconstructed
// into the full styled, editable grid. This avoids returning a misleading 422
// response and losing all the user's data after a layout conversion exception.
// It deliberately labels the simplified output instead of implying perfect
// visual preservation.
async function convertPdfToExcelFallback(pdfPath) {
  const pdf = await openPdf(pdfPath);
  const workbook = new ExcelJS.Workbook();
  try {
    const about = workbook.addWorksheet('Conversion Notes');
    about.getColumn(1).width = 95;
    about.getCell('A1').value = 'Simplified editable conversion';
    about.getCell('A1').font = { bold: true, size: 16 };
    about.getCell('A2').value =
      'The original PDF layout could not be reconstructed. This workbook preserves all selectable text returned by the PDF parser.';
    about.getCell('A2').alignment = { wrapText: true };
    about.getRow(2).height = 32;
    about.getCell('A3').value =
      'Check the Original sheet for visual reference. Scanned images require OCR for editable text.';
    about.getCell('A3').alignment = { wrapText: true };
    about.getRow(3).height = 32;

    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const viewport = page.getViewport({ scale: 1 });
        const text = await page.getTextContent();
        const entries = [];
        for (const item of text.items) {
          if (typeof item.str !== 'string' || !item.str.trim()) continue;
          const pos = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
          entries.push({ x: pos[0], y: pos[1], text: item.str });
        }
        entries.sort((a, b) => a.y - b.y || a.x - b.x);

        const sheet = workbook.addWorksheet('Page ' + number, {
          views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }],
        });
        sheet.columns = [
          { header: 'PDF X (pt)', key: 'x', width: 16 },
          { header: 'PDF Y (pt)', key: 'y', width: 16 },
          { header: 'Editable text', key: 'text', width: 100 },
        ];
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = {
          type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF174C63' },
        };
        for (const entry of entries) {
          const row = sheet.addRow({
            x: Math.round(entry.x * 10) / 10,
            y: Math.round(entry.y * 10) / 10,
            text: entry.text,
          });
          row.height = Math.min(150, Math.max(20, 16 * Math.ceil(entry.text.length / 90)));
          row.getCell(3).alignment = { wrapText: true, vertical: 'top' };
        }
        if (!entries.length) sheet.addRow({ text: 'No selectable text; OCR is required.' });

        const original = workbook.addWorksheet('Original ' + number, {
          views: [{ showGridLines: false }],
        });
        // Preserve visual evidence wherever rendering works. The editable
        // sheet remains usable even if the image render itself is defective.
        try {
          const rendered = await renderPage(pdf, page, 1);
          try {
            const id = workbook.addImage({
              buffer: rendered.canvas.toBuffer('image/png'), extension: 'png',
            });
            original.addImage(id, {
              tl: { col: 0, row: 0 },
              ext: { width: viewport.width * 96 / 72, height: viewport.height * 96 / 72 },
              editAs: 'oneCell',
            });
          } finally {
            pdf.canvasFactory.destroy(rendered);
          }
        } catch (error) {
          console.warn('PDF fallback page preview unavailable:', error?.name || 'Error');
          original.getCell('A1').value =
            'The original page preview could not be rendered. Editable text is on the Page sheet.';
          original.getColumn(1).width = 100;
        }
      } finally {
        page.cleanup();
      }
    }
    return writeOutput('xlsx', filename => workbook.xlsx.writeFile(filename));
  } finally {
    await pdf.destroy();
  }
}

module.exports = { convertPdfToExcelFallback };
