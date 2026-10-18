const PPTX = require('pptxgenjs');
const { outputPath } = require('./output');
const { readWorkbook, displayCell, color } = require('./workbook');

exports.convertExcelToPpt = async inputPath => {
  const workbook = await readWorkbook(inputPath);
  const pptx = new PPTX();
  pptx.layout = 'LAYOUT_WIDE';
  for (const sheet of workbook.worksheets) {
    const slide = pptx.addSlide();
    slide.addText(sheet.name, { x: 0.4, y: 0.15, w: 12.5, h: 0.4, fontSize: 18, bold: true });
    if (!sheet.rowCount) continue;
    const rows = Array.from({ length: sheet.rowCount }, (_, r) =>
      Array.from({ length: Math.max(1, sheet.columnCount) }, (_, c) => {
        const cell = sheet.getCell(r+1,c+1);
        return { text: cell.isMerged && cell.master.address !== cell.address ? '' : displayCell(cell), options: {
          bold: !!cell.font?.bold, color: color(cell.font?.color, '000000'),
          fill: cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? color(cell.fill.fgColor, 'FFFFFF') : 'FFFFFF',
        } };
      }));
    slide.addTable(rows, { x: 0.4, y: 0.7, w: 12.5, fontSize: 10, margin: 0.05,
      border: { type: 'solid', color: 'AAAAAA', pt: 0.5 }, autoPage: true, autoPageSlideStartY: 0.4 });
  }
  const filename = outputPath('pptx');
  await pptx.writeFile({ fileName: filename });
  return filename;
};
