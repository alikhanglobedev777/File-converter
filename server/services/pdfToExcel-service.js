const ExcelJS = require('exceljs');
const { writeOutput } = require('./output');
const { openPdf, renderPage, cropPage, extractLayout, joinItems, positionedLines, isTableLayout } = require('./pdf-layout');

const uniquePositions = values => values.sort((a, b) => a - b).filter((v, i, all) => i === 0 || v - all[i - 1] > 1);
const nearest = (values, value) => values.reduce((best, v, i) => Math.abs(v - value) < Math.abs(values[best] - value) ? i : best, 0);

function setValue(cell, text) {
  // Keep IDs with leading zeroes as text and retain numeric display precision.
  if (/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?%?$/.test(text) && text.replace(/\D/g, '').length <= 15) {
    const percent = text.endsWith('%');
    cell.value = Number(text.replace(/[, %]/g, '')) / (percent ? 100 : 1);
    const decimals = text.match(/\.(\d+)/)?.[1].length || 0;
    cell.numFmt = (text.includes(',') ? '#,##0' : '0') + (decimals ? '.' + '0'.repeat(decimals) : '') + (percent ? '%' : '');
  } else cell.value = text;
}

function styleText(cell, items) {
  const first = items[0];
  if (!first) return;
  cell.font = { name: first.font, size: first.size, bold: first.bold, italic: first.italic, color: { argb: `FF${first.color}` } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
}

function addImage(workbook, sheet, buffer, row, width, height, endColumn) {
  const imageId = workbook.addImage({ buffer, extension: 'png' });
  const extent = endColumn ? { br: { col: endColumn, row: row + 1 } } : { ext: { width: width * 96 / 72, height: height * 96 / 72 } };
  sheet.addImage(imageId, { tl: { col: 0, row }, ...extent, editAs: 'oneCell' });
}

// Use a fixed coordinate grid for non-tabular pages (CVs, forms, invoices).
// Guessing columns from every text fragment creates tiny columns and pushes
// neighboring text into unrelated cells. The grid retains PDF x/y placement.
function placePositionedText(sheet, layout) {
  const grid = 10; // PDF points per Excel column
  const columnCount = Math.min(160, Math.ceil(layout.width / grid));
  const pointsToExcelWidth = points => Math.max(1, (points * 96 / 72 - 5) / 7);
  for (let col = 1; col <= columnCount; col++) {
    sheet.getColumn(col).width = pointsToExcelWidth(grid);
  }
  const lines = positionedLines(layout.items);
  let rowIndex = 1, bottom = 0;
  for (const line of lines) {
    const gap = line.y - bottom;
    if (gap > 1.5) {
      // A spacer is necessary: Excel normally collapses blank PDF whitespace.
      sheet.getRow(rowIndex++).height = Math.min(409, gap);
    }
    const row = sheet.getRow(rowIndex++);
    row.height = Math.max(9, Math.min(409, line.height));
    const segments = line.segments;
    let usedThrough = 0, previousCell;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const start = Math.max(1, Math.floor(Math.max(0, segment.x) / grid) + 1);
      if (start <= usedThrough) {
        // Overlapping PDF text runs must never silently replace earlier text.
        if (previousCell) previousCell.value = String(previousCell.value ?? '') + ' ' + segment.text;
        continue;
      }
      if (start > columnCount) continue;
      const next = segments[i + 1];
      const nextStart = next ? Math.max(1, Math.floor(Math.max(0, next.x) / grid) + 1) : columnCount + 1;
      const textRight = segment.x + Math.max(segment.width, segment.size * segment.text.length * 0.35);
      const end = Math.min(columnCount, nextStart - 1,
        Math.max(start, Math.ceil((textRight + 2) / grid)));
      if (end > start) sheet.mergeCells(rowIndex - 1, start, rowIndex - 1, end);
      const cell = sheet.getCell(rowIndex - 1, start);
      setValue(cell, segment.text);
      styleText(cell, [segment]);
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false, indent: 0 };
      previousCell = cell;
      usedThrough = Math.max(start, end);
    }
    bottom = Math.max(bottom, line.y + line.height);
  }
  if (!lines.length) {
    sheet.getCell('A1').value = 'Image-only page: the Original sheet preserves the PDF appearance. OCR is required for editable text.';
  }
  sheet.pageSetup.printArea = 'A1:' + sheet.getColumn(columnCount).letter + Math.max(1, sheet.rowCount);
}

exports.convertPdfToExcel = async (pdfPath) => {
  const document = await openPdf(pdfPath);
  const workbook = new ExcelJS.Workbook();
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
      const page = await document.getPage(pageNumber);
      const layout = await extractLayout(page);
      const sheet = workbook.addWorksheet(`Page ${pageNumber}`, {
        views: [{ showGridLines: false }],
        pageSetup: { orientation: layout.width > layout.height ? 'landscape' : 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.2, right: 0.2, top: 0.2, bottom: 0.2, header: 0, footer: 0 } },
      });
      const rendered = await renderPage(document, page);
      try {
        if (isTableLayout(layout)) {
          const xs = uniquePositions(layout.cells.flatMap(c => [c.x, c.x + c.width]));
          const ys = uniquePositions(layout.cells.flatMap(c => [c.y, c.y + c.height]));
          const left = xs[0], top = ys[0], bottom = ys.at(-1), width = xs.at(-1) - left;
          xs.slice(0, -1).forEach((x, i) => { sheet.getColumn(i + 1).width = Math.max(1, ((xs[i + 1] - x) * 96 / 72 - 5) / 7); });
          // Preserve logos/headings/footers as images, while table cells remain editable.
          const offset = top > 1 ? 1 : 0;
          if (offset) {
            sheet.getRow(1).height = Math.min(top, 409);
            addImage(workbook, sheet, cropPage(document, rendered, left, 0, width, top), 0, width, top, xs.length - 1);
          }
          ys.slice(0, -1).forEach((y, i) => { sheet.getRow(i + 1 + offset).height = Math.min(409, ys[i + 1] - y); });
          const occupied = new Set();
          for (const rect of layout.cells) {
            const row = nearest(ys, rect.y) + 1 + offset, col = nearest(xs, rect.x) + 1;
            const lastRow = nearest(ys, rect.y + rect.height) + offset, lastCol = nearest(xs, rect.x + rect.width);
            const key = `${row}:${col}:${lastRow}:${lastCol}`;
            if (occupied.has(key)) continue;
            occupied.add(key);
            if (lastRow > row || lastCol > col) sheet.mergeCells(row, col, lastRow, lastCol);
            const cell = sheet.getCell(row, col);
            const items = layout.items.filter(item => item.x >= rect.x - 1 && item.x < rect.x + rect.width - 1 && item.y + item.size / 2 >= rect.y && item.y + item.size / 2 < rect.y + rect.height);
            setValue(cell, joinItems(items)); styleText(cell, items);
            if (rect.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${rect.fill}` } };
            if (rect.stroke) {
              const edge = { style: rect.lineWidth > 1.2 ? 'medium' : 'thin', color: { argb: `FF${rect.stroke}` } };
              cell.border = { top: edge, bottom: edge, left: edge, right: edge };
            }
          }
          const footerHeight = layout.height - bottom;
          if (footerHeight > 1) {
            const row = ys.length + offset;
            sheet.getRow(row).height = Math.min(409, footerHeight);
            addImage(workbook, sheet, cropPage(document, rendered, left, bottom, width, footerHeight), row - 1, width, footerHeight, xs.length - 1);
          }
          sheet.pageSetup.printArea = `A1:${sheet.getColumn(xs.length - 1).letter}${sheet.rowCount}`;
        } else {
          placePositionedText(sheet, layout);
          const original = workbook.addWorksheet(`Original ${pageNumber}`, { views: [{ showGridLines: false }] });
          addImage(workbook, original, rendered.canvas.toBuffer('image/png'), 0, layout.width, layout.height);
        }
      } finally { document.canvasFactory.destroy(rendered); }
      page.cleanup();
    }
    return writeOutput('xlsx', filename => workbook.xlsx.writeFile(filename));
  } finally { await document.destroy(); }
};
