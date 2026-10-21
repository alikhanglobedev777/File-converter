const fs = require('node:fs/promises');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, WidthType, TabStopType, AlignmentType,
} = require('docx');
const { writeOutput } = require('./output');
const {
  openPdf, renderPage, extractLayout, positionedLines, isTableLayout, joinItems,
} = require('./pdf-layout');

// A PDF page contains positioned text rather than flowing paragraphs. Rebuild
// it with genuine Word text runs and tables, NOT a full-page PNG of selectable
// text. Decorative imagery cannot always be reconstructed as Word shapes.
const PAGE_MARGIN = 20; // PDF points

function makeRun(item) {
  return new TextRun({
    text: item.text,
    bold: !!item.bold, italics: !!item.italic,
    font: item.font || 'Arial',
    size: Math.max(8, Math.min(144, Math.round((item.size || 10) * 2))),
    color: item.color || '000000',
  });
}

function makeParagraphs(items, startingBottom = PAGE_MARGIN, pageWidth = 612) {
  const paragraphs = [];
  let bottom = startingBottom;
  for (const line of positionedLines(items)) {
    if (!line.segments.length) continue;
    const segments = line.segments;
    const first = segments[0];
    const indentation = Math.max(0, Math.round((first.x - PAGE_MARGIN) * 20));
    const tabStops = [];
    const runs = [makeRun(first)];
    let right = first.x + Math.max(0, first.width);
    for (let index = 1; index < segments.length; index++) {
      const segment = segments[index];
      if (segment.x - right > Math.max(3, segment.size * 0.3)) {
        // Tab stops preserve independent right-side labels, contact blocks and
        // dates instead of inserting guessed numbers of spaces.
        tabStops.push({ type: TabStopType.LEFT,
          position: Math.min(Math.round((pageWidth - PAGE_MARGIN * 2) * 20),
            Math.max(indentation + 1, Math.round((segment.x - PAGE_MARGIN) * 20))) });
        runs.push(new TextRun({ text: '\t' }));
      } else if (segment.x > right + 0.5) {
        runs.push(new TextRun({ text: ' ' }));
      }
      runs.push(makeRun(segment));
      right = Math.max(right, segment.x + Math.max(0, segment.width));
    }
    // Use at least single-line-height spacing; never set exact height that
    // would clip wrapped text in Word.
    paragraphs.push(new Paragraph({
      indent: { left: indentation },
      tabStops,
      spacing: { before: Math.max(0, Math.round((line.y - bottom) * 20)), after: 0 },
      children: runs,
    }));
    bottom = Math.max(bottom, line.y + line.height);
  }
  return paragraphs;
}

function buildEditableTable(layout) {
  const cells = layout.cells;
  const left = Math.min(...cells.map(c => c.x));
  const right = Math.max(...cells.map(c => c.x + c.width));
  const width = Math.min(right - left, layout.width - PAGE_MARGIN * 2);
  const ratio = width / Math.max(1, right - left);
  const rows = [];
  for (const rect of [...cells].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find(r => Math.abs(r.y - rect.y) <= 1);
    if (!row) rows.push(row = { y: rect.y, cells: [] });
    // Rectangles can be drawn more than once by the PDF renderer.
    if (!row.cells.some(c => Math.abs(c.x - rect.x) <= 1 &&
        Math.abs(c.width - rect.width) <= 1 &&
        Math.abs(c.height - rect.height) <= 1)) row.cells.push(rect);
  }

  return new Table({
    width: { size: Math.max(1, Math.round(width * 20)), type: WidthType.DXA },
    indent: { size: Math.max(0, Math.round((left - PAGE_MARGIN) * 20)), type: WidthType.DXA },
    rows: rows.map(row => new TableRow({
      height: { value: Math.round(Math.max(...row.cells.map(cell => cell.height)) * 20), rule: 'atLeast' },
      children: row.cells.sort((a, b) => a.x - b.x).map(rect => {
        const contents = layout.items.filter(item =>
          item.x >= rect.x - 1 && item.x < rect.x + rect.width - 1 &&
          item.y + item.size / 2 >= rect.y &&
          item.y + item.size / 2 < rect.y + rect.height);
        const first = contents[0] || {};
        const border = rect.stroke ? {
          style: 'single', size: rect.lineWidth > 1.2 ? 8 : 4,
          color: rect.stroke,
        } : undefined;
        return new TableCell({
          width: { size: Math.max(1, Math.round(rect.width * ratio * 20)), type: WidthType.DXA },
          shading: rect.fill ? { fill: rect.fill } : undefined,
          borders: border ? { top: border, bottom: border, left: border, right: border } : undefined,
          margins: { top: 50, bottom: 50, left: 60, right: 60 },
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [makeRun({ ...first, text: joinItems(contents) })],
          })],
        });
      }),
    })),
  });
}

function belongsToTable(item, cells) {
  return cells.some(rect => item.x >= rect.x - 1 &&
    item.x < rect.x + rect.width - 1 &&
    item.y + item.size / 2 >= rect.y &&
    item.y + item.size / 2 < rect.y + rect.height);
}

function editablePage(layout) {
  if (!layout.items.length) return [];
  if (!isTableLayout(layout)) return makeParagraphs(layout.items, PAGE_MARGIN, layout.width);

  const top = Math.min(...layout.cells.map(c => c.y));
  const bottom = Math.max(...layout.cells.map(c => c.y + c.height));
  const outside = layout.items.filter(item => !belongsToTable(item, layout.cells));
  const before = outside.filter(item => item.y < top);
  const after = outside.filter(item => item.y >= top);
  const heading = makeParagraphs(before, PAGE_MARGIN, layout.width);
  const headingBottom = before.length ?
    Math.max(...before.map(item => item.y + item.size * 1.35)) : PAGE_MARGIN;
  const tableGap = Math.max(0, top - headingBottom);
  return [
    ...heading,
    ...(tableGap > 2 ? [new Paragraph({
      spacing: { before: Math.round(tableGap * 20), after: 0 },
      children: [new TextRun({ text: '' })],
    })] : []),
    buildEditableTable(layout),
    ...makeParagraphs(after, bottom, layout.width),
  ];
}

exports.convertPdfToWord = async (inputPath) => {
  const pdf = await openPdf(inputPath);
  const sections = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      try {
        const layout = await extractLayout(page);
        let children = editablePage(layout);
        if (!layout.items.length) {
          // Scans without embedded text cannot be editable without OCR. Only
          // these pages use an image, and the conversion explains why.
          const rendered = await renderPage(pdf, page);
          try {
            const scale = Math.min(1,
              (layout.width - PAGE_MARGIN * 2) / Math.max(1, layout.width),
              (layout.height - PAGE_MARGIN * 2 - 36) / Math.max(1, layout.height));
            const width = Math.max(1, layout.width * scale);
            const height = Math.max(1, layout.height * scale);
            children = [
              new Paragraph({ children: [new TextRun('This scanned PDF page contains no selectable text. OCR is required for editable text.')] }),
              new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({
                type: 'png', data: rendered.canvas.toBuffer('image/png'),
                transformation: { width: Math.round(width * 96 / 72),
                  height: Math.round(height * 96 / 72) },
              })] }),
            ];
          } finally { pdf.canvasFactory.destroy(rendered); }
        }
        sections.push({
          properties: { page: {
            size: { width: Math.round(layout.width * 20), height: Math.round(layout.height * 20) },
            margin: { top: PAGE_MARGIN * 20, bottom: PAGE_MARGIN * 20,
              left: PAGE_MARGIN * 20, right: PAGE_MARGIN * 20 },
          } },
          children: children.length ? children : [new Paragraph('')],
        });
      } finally { page.cleanup(); }
    }
    return writeOutput('docx', async filename =>
      fs.writeFile(filename, await Packer.toBuffer(new Document({ sections }))));
  } finally { await pdf.destroy(); }
};
