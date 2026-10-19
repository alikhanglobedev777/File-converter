const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { writeOutput } = require('./output');

async function imageBufferForPdf(filename) {
  const input = await fs.readFile(filename);
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.png') return { kind: 'png', buffer: input };
  if (extension === '.jpg' || extension === '.jpeg') return { kind: 'jpg', buffer: input };
  // Fallback for formats like WEBP if they are allowed in future.
  return { kind: 'png', buffer: await sharp(input).png().toBuffer() };
}

async function convertImagesToPdf(files) {
  return writeOutput('pdf', async (output) => {
    const pdf = await PDFDocument.create();
    for (const file of files) {
      const { kind, buffer } = await imageBufferForPdf(file.path || file);
      const image = kind === 'png' ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
      const { width, height } = image.scale(1);
      const page = pdf.addPage([width, height]);
      page.drawImage(image, { x: 0, y: 0, width, height });
    }
    await fs.writeFile(output, await pdf.save());
  });
}

module.exports = { convertImagesToPdf };
