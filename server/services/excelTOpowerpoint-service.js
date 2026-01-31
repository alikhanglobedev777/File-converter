const XLSX = require("xlsx");
const PPTXGenJS = require("pptxgenjs");
const fs = require("fs");
const path = require("path");

// Convert Excel → PPT
exports.convertExcelToPpt = async (inputPath) => {
  try {
    const workbook = XLSX.readFile(inputPath);
    const pptx = new PPTXGenJS();

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 });
      const slide = pptx.addSlide();
      slide.addTable(sheet);
    });

    const outputDir = path.join(__dirname, "../outputs");
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, `converted-${Date.now()}.pptx`);
    await pptx.writeFile({ fileName: outputPath });

    return outputPath;
  } catch (err) {
    console.error("Excel → PPT conversion failed:", err);
    throw err;
  }
};
