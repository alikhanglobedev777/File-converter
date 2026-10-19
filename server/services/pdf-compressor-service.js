const fs = require('node:fs/promises');
const { PDFDocument } = require('pdf-lib');
const { openPdf, renderPage } = require('./pdf-layout');
const { writeOutput } = require('./output');

class CompressionOptionsError extends Error {
  constructor(message) { super(message); this.name = 'CompressionOptionsError'; }
}

const PROFILES = Object.freeze({
  lossless: null,
  balanced: { scale: 1.2, quality: 72 },
  strong: { scale: 0.9, quality: 52 },
});

function parseCompressionLevel(level = 'lossless') {
  if (!Object.hasOwn(PROFILES, level)) {
    throw new CompressionOptionsError('Choose lossless, balanced, or strong PDF compression.');
  }
  return level;
}

async function recompressRaster(inputPath, profile) {
  const document = await openPdf(inputPath);
  try {
    if (document.numPages > 25) {
      throw new CompressionOptionsError('Image compression supports up to 25 pages. Choose lossless for longer documents.');
    }
    const result = await PDFDocument.create();
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      try {
        const rendered = await renderPage(document, page, profile.scale);
        try {
          const image = await result.embedJpg(rendered.canvas.toBuffer('image/jpeg', profile.quality));
          const out = result.addPage([rendered.width, rendered.height]);
          out.drawImage(image, { x: 0, y: 0, width: rendered.width, height: rendered.height });
        } finally {
          document.canvasFactory.destroy(rendered);
        }
      } finally { page.cleanup(); }
    }
    return Buffer.from(await result.save({ useObjectStreams: true }));
  } finally { await document.destroy(); }
}

async function compressPdf(inputPath, requestedLevel = 'lossless') {
  const level = parseCompressionLevel(requestedLevel);
  const original = await fs.readFile(inputPath);
  let compressed;
  if (level === 'lossless') {
    const document = await PDFDocument.load(original);
    compressed = Buffer.from(await document.save({ useObjectStreams: true }));
  } else {
    // Raster profiles trade text/search/editability for size. The UI labels that trade-off.
    compressed = await recompressRaster(inputPath, PROFILES[level]);
  }
  // Don't falsely claim compression when the output is bigger than the source.
  // The original is already a valid PDF; the format-contract checks the output.
  const result = compressed.length < original.length ? compressed : original;
  return writeOutput('pdf', filename => fs.writeFile(filename, result));
}

module.exports = { compressPdf, parseCompressionLevel, CompressionOptionsError };
