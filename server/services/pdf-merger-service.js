const PDFMerger = require("pdf-merger-js");
const fs = require("fs");
const path = require("path");

// Safely delete a file
const safeUnlink = (filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error("Failed to delete file:", filePath, err);
  }
};

// Merge multiple PDFs
const mergePdfs = async (filePaths) => {
  const merger = new PDFMerger();

  for (const fp of filePaths) {
    const absPath = path.resolve(fp); // Make absolute path
    if (!fs.existsSync(absPath)) throw new Error(`File not found: ${absPath}`);
    console.log("Adding PDF:", absPath);
    await merger.add(absPath);
  }

  const outputDir = path.resolve(__dirname, "../outputs");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `merged-${Date.now()}.pdf`);
  await merger.save(outputPath);
  console.log("Merged PDF saved to:", outputPath);
  return outputPath;
};

module.exports = { mergePdfs, safeUnlink };
