const path = require('node:path');
const { convertPdfToExcel } = require('../services/pdfToExcel-service');
const { convertPdfToWord } = require('../services/pdfToword-service');
const { convertPdfToJpg } = require('../services/pdfToJpg-service');
const { convertPdfToPpt } = require('../services/pdfTopowerpoint-service');
const { convertExcelToPdf } = require('../services/excelTopdf-service');
const { convertExcelToWord } = require('../services/excelTOword-service');
const { convertExcelToPpt } = require('../services/excelTOpowerpoint-service');
const { mergePdfs, safeUnlink } = require('../services/pdf-merger-service');
const { makeZip } = require('../services/zip-service');

function conversion(convert, { multiple = false, minimum = 1, name } = {}) {
  return async (req, res) => {
    const files = req.files || (req.file ? [req.file] : []);
    let output;
    try {
      if (files.length < minimum) return res.status(400).json({ error: `Upload at least ${minimum} file(s).` });
      output = await convert(multiple ? files : files[0].path);
      const base = name || path.parse(files[0].originalname).name;
      const downloadName = base + path.extname(output);
      await new Promise(resolve => res.download(output, downloadName, error => {
        if (error && !res.headersSent && !res.destroyed) res.status(500).json({ error: 'Download failed.' });
        resolve();
      }));
    } catch (error) {
      console.error('Conversion failed:', error.name);
      if (!res.headersSent && !res.destroyed) res.status(422).json({ error: 'Conversion failed. Check that the file is valid, supported, and not password-protected.' });
    } finally {
      files.forEach(file => safeUnlink(file.path));
      safeUnlink(output);
    }
  };
}
exports.pdfToExcel = conversion(convertPdfToExcel);
exports.pdfToWord = conversion(convertPdfToWord);
exports.pdfToJpg = conversion(convertPdfToJpg);
exports.pdfToPpt = conversion(convertPdfToPpt);
exports.excelToPdf = conversion(convertExcelToPdf);
exports.excelToWord = conversion(convertExcelToWord);
exports.excelToPpt = conversion(convertExcelToPpt);
exports.pdfMerger = conversion(files => mergePdfs(files.map(file => file.path)), { multiple: true, minimum: 2, name: 'merged' });
exports.zipMaker = conversion(makeZip, { multiple: true, name: 'archive' });
