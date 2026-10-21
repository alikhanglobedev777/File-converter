const ExcelJS = require('exceljs');
const { writeOutput } = require('./output');
const { openPdf, renderPage, cropPage, extractLayout, joinItems } = require('./pdf-layout');
const { spatialRows } = require('./pdf-spatial-rows');

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
          // Use the page's real PDF coordinates, rather than a guessed set of
          // text-start columns. Sparse, narrow columns + merged blocks preserve
          // headings, bullets, right-aligned dates, and vertical whitespace.
          const rows = spatialRows(layout.items);
          const step = 9; // PDF points per Excel column
          const columnCount = Math.max(1, Math.ceil(layout.width / step));
          const columnWidth = step * 96 / 72 / 7;
          for (let col = 1; col <= columnCount; col++) sheet.getColumn(col).width = columnWidth;
          let rowNumber = 1;
          if (rows.length && rows[0].y > 1) {
            sheet.getRow(rowNumber++).height = Math.min(409, rows[0].y);
          }
          for (let index = 0; index < rows.length; index++) {
            const row = rows[index], next = rows[index + 1];
            const distance = next ? next.y - row.y : row.height * 1.35;
            sheet.getRow(rowNumber).height = Math.min(409, Math.max(row.height * 1.15, distance));
            row.segments.forEach((segment, position) => {
              const nextSegment = row.segments[position + 1];
              const firstCol = Math.max(1, Math.min(columnCount, Math.floor(segment.x / step) + 1));
              let lastCol = Math.max(firstCol, Math.min(columnCount, Math.ceil(
                (segment.x + Math.max(segment.width, segment.text.length * row.height * 0.4) + 3) / step
              )));
              if (nextSegment) lastCol = Math.max(firstCol, Math.min(lastCol, Math.floor(nextSegment.x / step)));
              if (lastCol > firstCol) sheet.mergeCells(rowNumber, firstCol, rowNumber, lastCol);
              const cell = sheet.getCell(rowNumber, firstCol);
              setValue(cell, segment.text);
              styleText(cell, segment.items);
              cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: false, indent: 0 };
            });
            rowNumber++;
          }
          if (!rows.length) {
            // An image-only PDF must not become an empty worksheet.
            addImage(workbook, sheet, rendered.canvas.toBuffer('image/png'), 0, layout.width, layout.height);
          }
          sheet.pageSetup.printArea = `A1:${sheet.getColumn(columnCount).letter}${Math.max(1, rowNumber - 1)}`;
          // Keep a pixel-faithful reference next to the editable reconstruction.
          const original = workbook.addWorksheet(`Original ${pageNumber}`, { views: [{ showGridLines: false }] });
          addImage(workbook, original, rendered.canvas.toBuffer('image/png'), 0, layout.width, layout.height);
        }
      } finally { document.canvasFactory.destroy(rendered); }
      page.cleanup();
    }
    return writeOutput('xlsx', filename => workbook.xlsx.writeFile(filename));
  } finally { await document.destroy(); }
};
