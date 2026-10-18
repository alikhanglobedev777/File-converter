const PPTX = require('pptxgenjs');
const { outputPath } = require('./output');
const { openPdf, renderPage } = require('./pdf-layout');

exports.convertPdfToPpt = async (inputPath) => {
  const document = await openPdf(inputPath);
  const pptx = new PPTX();
  try {
    const first = (await document.getPage(1)).getViewport({ scale: 1 });
    const width = first.width / 72, height = first.height / 72;
    pptx.defineLayout({ name: 'PDF', width, height });
    pptx.layout = 'PDF';
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const rendered = await renderPage(document, page, 2);
      try {
        const scale = Math.min(width / rendered.width, height / rendered.height);
        const w = rendered.width * scale, h = rendered.height * scale;
        pptx.addSlide().addImage({
          data: 'image/png;base64,' + rendered.canvas.toBuffer('image/png').toString('base64'),
          x: (width - w) / 2, y: (height - h) / 2, w, h,
        });
      } finally { document.canvasFactory.destroy(rendered); }
      page.cleanup();
    }
    const filename = outputPath('pptx');
    await pptx.writeFile({ fileName: filename });
    return filename;
  } finally { await document.destroy(); }
};
