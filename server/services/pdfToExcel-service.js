const ExcelJS = require('exceljs');
const { writeOutput } = require('./output');
const { openPdf, renderPage, cropPage, extractLayout, groupLines, joinItems } = require('./pdf-layout');

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
        if (layout.cells.length >= 4) {
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
          const lines = groupLines(layout.items);
          const starts = uniquePositions(lines.filter(line => line.items.length > 1).flatMap(line => line.items.map(item => item.x)));
          const columns = starts.length > 0 && starts.length <= 30 ? starts : [0];
          columns.forEach((x, i) => { sheet.getColumn(i + 1).width = Math.max(12, Math.min(80, ((columns[i + 1] || layout.width) - x) / 5)); });
          lines.forEach((line, index) => {
            const buckets = new Map();
            for (const item of line.items) {
              const col = nearest(columns, item.x) + 1;
              if (!buckets.has(col)) buckets.set(col, []);
              buckets.get(col).push(item);
            }
            sheet.getRow(index + 1).height = Math.max(...line.items.map(item => item.size)) * 1.5;
            for (const [col, items] of buckets) {
              const cell = sheet.getCell(index + 1, col);
              setValue(cell, joinItems(items)); styleText(cell, items);
            }
          });
          if (!lines.length) sheet.getCell('A1').value = 'Image-only PDF page: see Original sheet. OCR is required for editable text.';
          const original = workbook.addWorksheet(`Original ${pageNumber}`, { views: [{ showGridLines: false }] });
          addImage(workbook, original, rendered.canvas.toBuffer('image/png'), 0, layout.width, layout.height);
        }
      } finally { document.canvasFactory.destroy(rendered); }
      page.cleanup();
    }
    return writeOutput('xlsx', filename => workbook.xlsx.writeFile(filename));
  } finally { await document.destroy(); }
};
