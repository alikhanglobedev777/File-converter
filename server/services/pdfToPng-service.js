const fs = require('node:fs/promises');
const { writeOutput } = require('./output');
const { openPdf, renderPage } = require('./pdf-layout');
const { PdfPageSelectionError } = require('./pdfToJpg-service');
const { pngExportOptions } = require('./pdf-export-options');

// Export one chosen PDF page as a genuine lossless PNG. Keep the same page
// selection and maximum canvas size protections used by the JPG renderer.
exports.convertPdfToPng = async (inputPath, selectedPage = '1', options = {}) => {
  const { scale } = pngExportOptions(options);
  if (typeof selectedPage !== 'string' || !/^[1-9]\d*$/.test(selectedPage) ||
      !Number.isSafeInteger(Number(selectedPage))) {
    throw new PdfPageSelectionError('Enter a valid PDF page number (1 or higher).');
  }
  const pageNumber = Number(selectedPage);
  const document = await openPdf(inputPath);
  try {
    if (pageNumber > document.numPages) {
      throw new PdfPageSelectionError(
        `This PDF has ${document.numPages} page(s). Choose a page between 1 and ${document.numPages}.`
      );
    }
    const page = await document.getPage(pageNumber);
    try {
      const rendered = await renderPage(document, page, scale);
      try {
        return await writeOutput('png', filename =>
          fs.writeFile(filename, rendered.canvas.toBuffer('image/png')));
      } finally {
        document.canvasFactory.destroy(rendered);
      }
    } finally {
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }
};
