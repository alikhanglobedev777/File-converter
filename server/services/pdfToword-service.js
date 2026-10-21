const fs = require('node:fs/promises');
const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Table, TableRow, TableCell, WidthType, TabStopType } = require('docx');
const { writeOutput } = require('./output');
const { openPdf, renderPage, extractLayout, positionedLines, isTableLayout, joinItems } = require('./pdf-layout');

// A PDF is a fixed-position canvas; turning it directly into flowing Word
// paragraphs changes line breaks, column placement, and page geometry.
// Keep a faithful, printable page first, with an editable text transcription
// separately (rather than pretending flow layout can perfectly match the PDF).
exports.convertPdfToWord = async (inputPath) => {
  const pdf = await openPdf(inputPath);
  const sections = [];
  const transcriptions = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      try {
        const layout = await extractLayout(page);
        const rendered = await renderPage(pdf, page);
        try {
          // Leave a little vertical room for Word's mandatory paragraph mark.
          const scale = Math.min(0.98, 15700 / (layout.height * 20));
          sections.push({
            properties: {
              page: {
                size: { width: Math.round(layout.width * 20), height: Math.round(layout.height * 20) },
                margin: { top: 0, bottom: 0, left: 0, right: 0, header: 0, footer: 0 },
              },
            },
            children: [new Paragraph({
              spacing: { before: 0, after: 0, line: 1 },
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({
                type: 'png',
                data: rendered.canvas.toBuffer('image/png'),
                transformation: {
                  width: Math.max(1, Math.round(layout.width * scale * 96 / 72)),
                  height: Math.max(1, Math.round(layout.height * scale * 96 / 72)),
                },
              })],
            })],
          });
        } finally { pdf.canvasFactory.destroy(rendered); }
        transcriptions.push({
          number: n, width: layout.width,
          tableCells: isTableLayout(layout) ? layout.cells : null,
          items: layout.items, lines: positionedLines(layout.items),
        });
      } finally { page.cleanup(); }
    }
    // The appendix makes extracted text editable/searchable without changing
    // the appearance of the PDF pages. Raster-only PDFs need OCR for this.
    if (transcriptions.some(page => page.lines.length)) {
      const children = [new Paragraph({
        heading: 'Heading1',
        children: [new TextRun('Editable text (transcribed from PDF)')],
      })];
      for (const page of transcriptions) {
        children.push(new Paragraph({
          heading: 'Heading2',
          children: [new TextRun('Page ' + page.number)],
        }));
        if (page.tableCells) {
          // Preserve editable tables alongside the page-faithful image sections.
          const cells = page.tableCells;
          const left = Math.min(...cells.map(c => c.x));
          const right = Math.max(...cells.map(c => c.x + c.width));
          const scale = Math.min(1, 10800 / Math.max(1, (right - left) * 20));
          const rows = [];
          for (const rect of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
            let row = rows.find(r => Math.abs(r.y - rect.y) < 1);
            if (!row) rows.push(row = { y: rect.y, cells: [] });
            if (!row.cells.some(c => Math.abs(c.x - rect.x) < 1 &&
                Math.abs(c.width - rect.width) < 1 && Math.abs(c.height - rect.height) < 1)) {
              row.cells.push(rect);
            }
          }
          children.push(new Table({
            width: { size: Math.round((right - left) * 20 * scale), type: WidthType.DXA },
            rows: rows.map(row => new TableRow({
              children: row.cells.sort((a, b) => a.x - b.x).map(rect => {
                const items = page.items.filter(item =>
                  item.x >= rect.x - 1 && item.x < rect.x + rect.width - 1 &&
                  item.y + item.size / 2 >= rect.y &&
                  item.y + item.size / 2 < rect.y + rect.height);
                const first = items[0] || {};
                const border = rect.stroke ? {
                  style: 'single',
                  size: rect.lineWidth > 1.2 ? 8 : 4,
                  color: rect.stroke,
                } : undefined;
                return new TableCell({
                  width: { size: Math.round(rect.width * 20 * scale), type: WidthType.DXA },
                  shading: rect.fill ? { fill: rect.fill } : undefined,
                  borders: border ? { top: border, right: border, bottom: border, left: border } : undefined,
                  margins: { top: 70, bottom: 70, left: 100, right: 100 },
                  children: [new Paragraph({ children: [new TextRun({
                    text: joinItems(items), bold: !!first.bold, italics: !!first.italic,
                    font: first.font || 'Arial', size: Math.max(2, Math.round((first.size || 10) * 2)),
                    color: first.color || '000000',
                  })] })],
                });
              }),
            })),
          }));
        }
        // Keep text outside detected tables editable too, without duplicating
        // table content in the transcription.
        const outside = page.tableCells ? page.items.filter(item =>
          !page.tableCells.some(rect =>
            item.x >= rect.x - 1 && item.x < rect.x + rect.width - 1 &&
            item.y + item.size / 2 >= rect.y &&
            item.y + item.size / 2 < rect.y + rect.height)
        ) : page.items;
        const lines = positionedLines(outside);
        const horizontalScale = Math.min(1, 540 / Math.max(1, page.width));
        let previousBottom = 0;
        for (const line of lines) {
          children.push(new Paragraph({
            spacing: {
              before: Math.round(Math.max(0, line.y - previousBottom) * 20),
              after: 0,
            },
            tabStops: line.segments.map(segment => ({
              type: TabStopType.LEFT,
              position: Math.max(0, Math.round(segment.x * horizontalScale * 20)),
            })),
            children: line.segments.flatMap(segment => [
              new TextRun({ text: '\t' }),
              new TextRun({
                text: segment.text, bold: !!segment.bold, italics: !!segment.italic,
                font: segment.font || 'Arial',
                size: Math.max(2, Math.round((segment.size || 10) * 2)),
                color: segment.color || '000000',
              }),
            ]),
          }));
          previousBottom = Math.max(previousBottom, line.y + line.height);
        }
      }
      sections.push({
        properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
        children,
      });
    }
    return writeOutput('docx', async filename => fs.writeFile(filename, await Packer.toBuffer(new Document({ sections }))));
  } finally { await pdf.destroy(); }
};
