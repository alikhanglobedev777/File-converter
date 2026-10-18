const { PDFDocument } = require('pdf-lib');
const fs = require('node:fs');
const { writeOutput } = require('./output');

function safeUnlink(filename) {
  if (!filename) return;
  try { fs.unlinkSync(filename); } catch (error) {
    if (error.code !== 'ENOENT') console.error('Temporary file cleanup failed:', error.code);
  }
}

async function mergePdfs(filenames) {
  if (!Array.isArray(filenames) || filenames.length < 2 || filenames.length > 10) {
    throw new Error('Merge requires 2 to 10 PDF files');
  }
  const merged = await PDFDocument.create();
  let totalPages = 0;
  // Preserve the exact order supplied by the browser, including each file's page order.
  for (const filename of filenames) {
    const bytes = fs.readFileSync(filename);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Merge input is not a PDF');
    const source = await PDFDocument.load(bytes);
    if (!source.getPageCount()) throw new Error('Cannot merge an empty PDF');
    const pages = await merged.copyPages(source, source.getPageIndices());
    for (const page of pages) merged.addPage(page);
    totalPages += pages.length;
  }
  if (merged.getPageCount() !== totalPages) throw new Error('PDF page count mismatch');
  // Intentionally only a .pdf output. Never use the ZIP maker here.
  return writeOutput('pdf', async filename => {
    const result = await merged.save();
    if (Buffer.from(result).subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid merged PDF');
    await fs.promises.writeFile(filename, result);
  });
}
module.exports = { mergePdfs, safeUnlink };
