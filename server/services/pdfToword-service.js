const fs = require('node:fs/promises');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, WidthType } = require('docx');
const { writeOutput } = require('./output');
const { openPdf, renderPage, cropPage, extractLayout, groupLines, joinItems, positionedLines, isTableLayout } = require('./pdf-layout');

exports.convertPdfToWord = async (inputPath) => {
  const pdf = await openPdf(inputPath);
  const sections = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const layout = await extractLayout(page);
      const rendered = await renderPage(pdf, page);
      const children = [];
      try {
        if (isTableLayout(layout)) {
          const left = Math.min(...layout.cells.map(c => c.x));
          const right = Math.max(...layout.cells.map(c => c.x + c.width));
          const top = Math.min(...layout.cells.map(c => c.y));
          const bottom = Math.max(...layout.cells.map(c => c.y + c.height));
          const printableWidth = Math.max(1, layout.width - 40); // left/right Word margins
          const headerScale = Math.min(1, printableWidth / (right - left));
          const imageParagraph = (y, height) => new Paragraph({ spacing: { after: 0, before: 0 }, children: [new ImageRun({
            type: 'png', data: cropPage(pdf, rendered, left, y, right - left, height),
            transformation: { width: (right - left) * headerScale * 96 / 72, height: height * headerScale * 96 / 72 },
          })] });
          if (top > 1) children.push(imageParagraph(0, top));
          const rows = [];
          for (const cell of [...layout.cells].sort((a,b) => a.y - b.y || a.x - b.x)) {
            let row = rows.find(row => Math.abs(row.y - cell.y) < 1);
            if (!row) rows.push(row = { y: cell.y, cells: [] });
            row.cells.push(cell);
          }
          children.push(new Table({
            width: { size: (right - left) * 20, type: WidthType.DXA },
            rows: rows.map(row => new TableRow({ children: row.cells.sort((a,b) => a.x-b.x).map(rect => {
              const items = layout.items.filter(i => i.x >= rect.x - 1 && i.x < rect.x + rect.width - 1 && i.y + i.size/2 >= rect.y && i.y + i.size/2 < rect.y + rect.height);
              const first = items[0];
              return new TableCell({
                width: { size: rect.width * 20, type: WidthType.DXA },
                shading: rect.fill ? { fill: rect.fill } : undefined,
                margins: { top: 70, bottom: 70, left: 100, right: 100 },
                children: [new Paragraph({ children: [new TextRun({
                  text: joinItems(items), bold: first?.bold, italics: first?.italic,
                  font: first?.font, size: (first?.size || 10) * 2, color: first?.color,
                })] })],
              });
            }) })),
          }));
          if (layout.height - bottom > 1) children.push(imageParagraph(bottom, layout.height - bottom));
        } else if (layout.items.length) {
          // Put text at its PDF horizontal stops instead of joining an entire
          // visual line into a single left-aligned Word paragraph.
          // Spacing between lines similarly follows the PDF coordinates.
          let bottom = 0;
          for (const line of positionedLines(layout.items)) {
            const tabs = line.segments.map(item => ({
              type: 'left',
              position: Math.max(0, Math.round(item.x * 20)),
            }));
            const gap = Math.max(0, line.y - bottom);
            children.push(new Paragraph({
              spacing: {
                before: Math.round(gap * 20),
                after: 0,
                line: Math.round(line.height * 20),
                lineRule: 'exact',
              },
              tabStops: tabs,
              children: line.segments.flatMap(item => [
                new TextRun({ text: '\\t' }),
                new TextRun({
                  text: item.text, bold: item.bold, italics: item.italic,
                  font: item.font, size: Math.max(2, Math.round(item.size * 2)),
                  color: item.color,
                }),
              ]),
            }));
            bottom = Math.max(bottom, line.y + line.height);
          }
        } else {
          // Image-only PDFs are inserted at their original aspect ratio, sized to
          // fit the Word page instead of stretching beyond its printable width.
          const scale = Math.min(1, Math.max(1, layout.width - 40) / layout.width);
          children.push(new Paragraph({ children: [new ImageRun({
            type: 'png', data: rendered.canvas.toBuffer('image/png'),
            transformation: { width: layout.width * scale * 96 / 72, height: layout.height * scale * 96 / 72 },
          })] }));
        }
      } finally { pdf.canvasFactory.destroy(rendered); }
      sections.push({ properties: { page: { size: { width: layout.width * 20, height: layout.height * 20 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } }, children });
      page.cleanup();
    }
    return writeOutput('docx', async filename => fs.writeFile(filename, await Packer.toBuffer(new Document({ sections }))));
  } finally { await pdf.destroy(); }
};
