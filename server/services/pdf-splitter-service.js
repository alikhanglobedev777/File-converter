const { PDFDocument } = require('pdf-lib');
const { writeOutput } = require('./output');
const { parsePageSelection } = require('./page-selection');

async function splitPdf(inputPath, selection) {
  const source = await PDFDocument.load(await require('node:fs/promises').readFile(inputPath));
  const total = source.getPageCount();
  const pages = parsePageSelection(selection, total, { label: 'Pages to keep' });
  return writeOutput('pdf', async (output) => {
    const target = await PDFDocument.create();
    const copied = await target.copyPages(source, pages.map((page) => page - 1));
    copied.forEach((page) => target.addPage(page));
    await require('node:fs/promises').writeFile(output, await target.save());
  });
}

module.exports = { splitPdf };
