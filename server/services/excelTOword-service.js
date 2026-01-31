const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun } = require("docx");

// Excel → Word
exports.convertExcelToWord = async (inputPath) => {
  const workbook = XLSX.readFile(inputPath);
  const outputDir = path.join(__dirname, "../outputs");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${path.basename(inputPath, path.extname(inputPath))}.docx`);
  const doc = new Document({ sections: [] });

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
    const table = new Table({
      rows: sheet.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun(cell ? String(cell) : "")] })],
                })
            ),
          })
      ),
    });
    doc.addSection({ children: [table] });
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outputPath, buffer);
  return outputPath;
};
