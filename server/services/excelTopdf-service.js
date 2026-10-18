const PDFDocument = require('pdfkit');
const fs = require('node:fs');
const { outputPath } = require('./output');
const { readWorkbook, displayCell, color } = require('./workbook');

exports.convertExcelToPdf = async inputPath => {
  const workbook = await readWorkbook(inputPath);
  const filename = outputPath('pdf');
  const doc = new PDFDocument({ autoFirstPage: false, margin: 30 });
  const stream = fs.createWriteStream(filename);
  const done = new Promise((resolve, reject) => { stream.on('finish', resolve); stream.on('error', reject); doc.on('error', reject); });
  done.catch(() => {});
  doc.pipe(stream);
  try {
    for (const sheet of workbook.worksheets) {
      if (!sheet.rowCount) continue;
      const columns = Math.max(1, sheet.columnCount);
      const landscape = sheet.pageSetup.orientation === 'landscape' || columns > 5;
      let y;
      const addPage = () => {
        doc.addPage({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 30 });
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000').text(sheet.name, 30, 25);
        y = 50;
      };
      addPage();
      const available = doc.page.width - 60;
      const weights = Array.from({ length: columns }, (_, i) => sheet.getColumn(i + 1).width || 12);
      const total = weights.reduce((a,b) => a+b, 0);
      const widths = weights.map(w => available * w / total);
      for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
        const row = sheet.getRow(rowNumber);
        const cells = Array.from({ length: columns }, (_, i) => row.getCell(i+1));
        const fontSize = Math.max(6, Math.min(11, 60 / columns));
        const height = Math.min(doc.page.height - 100, Math.max(22, row.height || 0, ...cells.map((cell,i) => {
          doc.font(cell.font?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize);
          return doc.heightOfString(displayCell(cell), { width: Math.max(8, widths[i] - 8) }) + 10;
        })));
        if (y + height > doc.page.height - 30) addPage();
        let x = 30;
        cells.forEach((cell,i) => {
          const fill = cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? color(cell.fill.fgColor, 'FFFFFF') : 'FFFFFF';
          doc.rect(x, y, widths[i], height).fillAndStroke('#' + fill, '#AAAAAA');
          doc.font(cell.font?.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor('#' + color(cell.font?.color, '000000'));
          doc.text(cell.isMerged && cell.master.address !== cell.address ? '' : displayCell(cell), x+4, y+5, { width: Math.max(8, widths[i]-8), height: height-8, ellipsis: true });
          x += widths[i];
        });
        y += height;
      }
    }
    if (!doc.bufferedPageRange().count) doc.addPage();
    doc.end();
    await done;
    return filename;
  } catch (error) {
    doc.destroy(); stream.destroy();
    await new Promise(resolve => stream.closed ? resolve() : stream.once('close', resolve));
    await fs.promises.rm(filename, { force: true });
    throw error;
  }
};
