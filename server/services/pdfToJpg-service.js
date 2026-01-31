const pdf = require("pdf-poppler");
const path = require("path");

exports.convertPdfToJpg = async (inputPath) => {
  const outputDir = path.dirname(inputPath);
  const baseName = path.basename(inputPath, path.extname(inputPath));

  const options = {
    format: "jpeg",
    out_dir: outputDir,
    out_prefix: baseName,
    page: null // convert ALL pages
  };

  await pdf.convert(inputPath, options);

  // Return first page image (you can zip later if you want)
  return path.join(outputDir, `${baseName}-1.jpg`);
};
