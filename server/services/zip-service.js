const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// Make a ZIP from multiple files
exports.makeZip = async (filePaths, outputName = "files.zip") => {
  const outputPath = path.join("uploads", `${Date.now()}-${outputName}`);
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.pipe(output);
  filePaths.forEach((file) => archive.file(file.path, { name: file.originalname }));

  await archive.finalize();
  return outputPath;
};
