const fs = require('node:fs/promises');
const { PDFDocument, degrees } = require('pdf-lib');
const { writeOutput } = require('./output');
const { parsePageSelection, parseRotationInstructions } = require('./page-selection');

async function organizePdf(inputPath, pageSelection, rotationInput = '') {
  const bytes = await fs.readFile(inputPath);
  const source = await PDFDocument.load(bytes);
  const total = source.getPageCount();
  const pages = parsePageSelection(pageSelection, total, { label: 'Page order', allowDuplicates: true });
  const rotations = parseRotationInstructions(rotationInput, total);

  return writeOutput('pdf', async (output) => {
    const target = await PDFDocument.create();
    const copied = await target.copyPages(source, pages.map((page) => page - 1));
    copied.forEach((page, index) => {
      const sourcePageNumber = pages[index];
      const angle = rotations.get(sourcePageNumber);
      if (typeof angle === 'number') page.setRotation(degrees(angle));
      target.addPage(page);
    });
    await fs.writeFile(output, await target.save());
  });
}

module.exports = { organizePdf };
