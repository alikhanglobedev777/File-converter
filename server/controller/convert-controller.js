const path = require('node:path');
const { convertPdfToExcel } = require('../services/pdfToExcel-service');
const { convertPdfToWord } = require('../services/pdfToword-service');
const { convertPdfToJpg, PdfPageSelectionError } = require('../services/pdfToJpg-service');
const { convertPdfToPpt } = require('../services/pdfTopowerpoint-service');
const { convertExcelToPdf } = require('../services/excelTopdf-service');
const { convertExcelToWord } = require('../services/excelTOword-service');
const { convertExcelToPpt } = require('../services/excelTOpowerpoint-service');
const { mergePdfs, safeUnlink } = require('../services/pdf-merger-service');
const { makeZip } = require('../services/zip-service');
const { verifyOutputFormat, OutputFormatError } = require('../services/format-contract');

function conversion(service, convert, { multiple = false, minimum = 1, name } = {}) {
  return async (req, res) => {
    const files = req.files || (req.file ? [req.file] : []);
    let output;
    try {
      if (files.length < minimum) return res.status(400).json({ error: `Upload at least ${minimum} file(s).` });
      output = await convert(multiple ? files : files[0].path, req);
      const { extension, contentType } = await verifyOutputFormat(service, output);
      // Never infer the attachment's format solely from the original upload name.
      const base = name || path.parse(path.basename(files[0].originalname.replace(/\\/g, '/'))).name;
      const pageSuffix = service === 'pdf-to-jpg' && Number(req.body.page || 1) > 1
        ? `-page-${String(req.body.page).padStart(3, '0')}` : '';
      const downloadName = `${base}${pageSuffix}.${extension}`;
      res.set({ 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      await new Promise(resolve => res.download(output, downloadName, error => {
        if (error && !res.headersSent && !res.destroyed) res.status(500).json({ error: 'Download failed.' });
        resolve();
      }));
    } catch (error) {
      console.error('Conversion failed:', error.name);
      if (!res.headersSent && !res.destroyed) res.status(error instanceof OutputFormatError ? 500 : error instanceof PdfPageSelectionError ? 400 : 422).json({
        error: error instanceof OutputFormatError
          ? 'The server produced an invalid output file. No file was downloaded. Please retry or check the server logs.'
          : error instanceof PdfPageSelectionError ? error.message
          : 'Conversion failed. Check that the file is valid, supported, and not password-protected.',
      });
    } finally {
      files.forEach(file => safeUnlink(file.path));
      safeUnlink(output);
    }
  };
}
exports.pdfToExcel = conversion('pdf-to-excel', convertPdfToExcel);
exports.pdfToWord = conversion('pdf-to-word', convertPdfToWord);
exports.pdfToJpg = conversion('pdf-to-jpg', (inputPath, req) => convertPdfToJpg(inputPath, req.body.page ?? '1'));
exports.pdfToPpt = conversion('pdf-to-ppt', convertPdfToPpt);
exports.excelToPdf = conversion('excel-to-pdf', convertExcelToPdf);
exports.excelToWord = conversion('excel-to-word', convertExcelToWord);
exports.excelToPpt = conversion('excel-to-ppt', convertExcelToPpt);
exports.pdfMerger = conversion('pdf-merger', files => mergePdfs(files.map(file => file.path)), { multiple: true, minimum: 2, name: 'merged' });
exports.zipMaker = conversion('zip-maker', makeZip, { multiple: true, name: 'archive' });
