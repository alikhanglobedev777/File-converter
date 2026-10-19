const fs = require('node:fs/promises');
const { writeOutput } = require('./output');
const { openPdf, renderPage } = require('./pdf-layout');

class PdfPageSelectionError extends Error {
  constructor(message) { super(message); this.name = 'PdfPageSelectionError'; }
}

// A single HTTP download is a single JPG. Users choose the page explicitly;
// a multi-page PDF must never turn into an unexpected ZIP archive.
exports.convertPdfToJpg = async (inputPath, selectedPage = '1') => {
  if (typeof selectedPage !== 'string' || !/^[1-9]\d*$/.test(selectedPage) ||
      !Number.isSafeInteger(Number(selectedPage))) {
    throw new PdfPageSelectionError('Enter a valid PDF page number (1 or higher).');
  }
  const pageNumber = Number(selectedPage);
  const document = await openPdf(inputPath);
  try {
    if (pageNumber > document.numPages) {
      throw new PdfPageSelectionError(`This PDF has ${document.numPages} page(s). Choose a page between 1 and ${document.numPages}.`);
    }
    const page = await document.getPage(pageNumber);
    try {
      const rendered = await renderPage(document, page, 2);
      try {
        return await writeOutput('jpg', filename =>
          fs.writeFile(filename, rendered.canvas.toBuffer('image/jpeg', 90)));
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

exports.PdfPageSelectionError = PdfPageSelectionError;
