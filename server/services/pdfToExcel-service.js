const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const ExcelJS = require("exceljs");

exports.convertPdfToExcel = async (pdfPath) => {
  const dataBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(dataBuffer);

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Sheet1");

  const lines = data.text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line !== "");

  lines.forEach((line) => {
    worksheet.addRow([line]);
  });

  const outputFileName = `converted-${Date.now()}.xlsx`;
  const outputPath = path.join("outputs", outputFileName);

  await workbook.xlsx.writeFile(outputPath);
  return outputPath;
};
