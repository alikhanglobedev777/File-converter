const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs');
const { outputPath } = require('./output');

function safeUnlink(filename) {
  if (!filename) return;
  try { fs.unlinkSync(filename); } catch (error) {
    if (error.code !== 'ENOENT') console.error('Temporary file cleanup failed:', error.code);
  }
}
async function mergePdfs(filenames) {
  const merged = await PDFDocument.create();
  for (const filename of filenames) {
    const source = await PDFDocument.load(fs.readFileSync(filename));
    for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
  }
  const filename = outputPath('pdf');
  fs.writeFileSync(filename, await merged.save());
  return filename;
}
module.exports = { mergePdfs, safeUnlink };
