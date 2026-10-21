const fs = require('node:fs/promises');
const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType } = require('docx');
const { writeOutput } = require('./output');
const { openPdf, renderPage, extractLayout } = require('./pdf-layout');
const { spatialRows } = require('./pdf-spatial-rows');

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
        transcriptions.push({ number: n, lines: spatialRows(layout.items) });
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
        for (const line of page.lines) {
          const sorted = line.segments.sort((a, b) => a.x - b.x);
          children.push(new Paragraph({
            spacing: { after: 0, before: 0 },
            children: sorted.map((segment, index) => {
              const first = segment.items[0] || {};
              return new TextRun({
                text: (index ? '    ' : '') + segment.text,
                bold: first.bold || false,
                italics: first.italic || false,
                font: first.font || 'Arial',
                size: Math.max(12, Math.min(48, Math.round((first.size || 10) * 2))),
                color: first.color || '000000',
              });
            }),
          }));
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
