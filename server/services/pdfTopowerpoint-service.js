const PPTX = require("pptxgenjs");
const path = require("path");
const fs = require("fs");
const pdf = require("pdf-poppler");

exports.convertPdfToPpt = async (inputPath) => {
  const outputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const pptx = new PPTX();

  // Convert PDF → images first
  await pdf.convert(inputPath, {
    format: "jpeg",
    out_dir: outputDir,
    out_prefix: baseName,
    page: null
  });

  // Detect generated images
  const files = fs.readdirSync(outputDir)
    .filter(f => f.startsWith(baseName) && f.endsWith(".jpg"))
    .sort();

  files.forEach((img) => {
    const slide = pptx.addSlide();
    slide.addImage({
      path: path.join(outputDir, img),
      x: 0,
      y: 0,
      w: "100%",
      h: "100%"
    });
  });

  const outputPath = path.join(outputDir, `${baseName}.pptx`);
  await pptx.writeFile(outputPath);

  // Cleanup images
  files.forEach(img => fs.unlinkSync(path.join(outputDir, img)));

  return outputPath;
};
