const fs = require('node:fs/promises');
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType } = require('docx');
const { writeOutput } = require('./output');
const { readWorkbook, displayCell, color } = require('./workbook');

exports.convertExcelToWord = async inputPath => {
  const workbook = await readWorkbook(inputPath);
  const sections = workbook.worksheets.map(sheet => {
    const children = [new Paragraph({ children: [new TextRun({ text: sheet.name, bold: true, size: 28 })] })];
    if (sheet.rowCount) children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: Array.from({ length: sheet.rowCount }, (_, r) => new TableRow({
        children: Array.from({ length: Math.max(1, sheet.columnCount) }, (_, c) => {
          const cell = sheet.getCell(r+1,c+1);
          return new TableCell({
            shading: cell.fill?.type === 'pattern' && cell.fill.pattern === 'solid' ? { fill: color(cell.fill.fgColor, 'FFFFFF') } : undefined,
            children: [new Paragraph({ children: [new TextRun({
              text: cell.isMerged && cell.master.address !== cell.address ? '' : displayCell(cell),
              bold: cell.font?.bold, italics: cell.font?.italic, color: color(cell.font?.color, '000000'),
              size: (cell.font?.size || 10)*2, font: cell.font?.name || 'Arial',
            })] })],
          });
        }),
      })),
    }));
    return { children };
  });
  return writeOutput('docx', async filename => fs.writeFile(filename, await Packer.toBuffer(new Document({ sections }))));
};
