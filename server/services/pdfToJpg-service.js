const fs = require('node:fs/promises');
const { outputPath } = require('./output');
const { openPdf, renderPage } = require('./pdf-layout');
const { makeZip } = require('./zip-service');

exports.convertPdfToJpg = async (inputPath) => {
  const document = await openPdf(inputPath);
  const images = [];
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const rendered = await renderPage(document, page, 2);
      try {
        const filename = outputPath('jpg');
        await fs.writeFile(filename, rendered.canvas.toBuffer('image/jpeg', 90));
        images.push({ path: filename, originalname: `page-${String(number).padStart(3, '0')}.jpg` });
      } finally { document.canvasFactory.destroy(rendered); }
      page.cleanup();
    }
    if (images.length === 1) return images[0].path;
    return await makeZip(images);
  } catch (error) {
    await Promise.all(images.map(image => fs.rm(image.path, { force: true })));
    throw error;
  } finally {
    if (images.length > 1) await Promise.all(images.map(image => fs.rm(image.path, { force: true })));
    await document.destroy();
  }
};
