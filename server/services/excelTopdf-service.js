const XLSX = require("xlsx");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// Convert Excel → PDF
exports.convertExcelToPdf = async (inputPath) => {
  try {
    const workbook = XLSX.readFile(inputPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });

    const outputDir = path.join(__dirname, "../outputs");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `converted-${Date.now()}.pdf`);

    const doc = new PDFDocument({ margin: 30 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    sheet.forEach((row) => {
      doc.text(row.join(" | ")); // simple formatting
    });

    doc.end();

    // Wait until PDF is fully written
    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    return outputPath;
  } catch (err) {
    console.error("Excel → PDF conversion failed:", err);
    throw err;
  }
};
