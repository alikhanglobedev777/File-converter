const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { convertPdfToExcel } = require('../services/pdfToExcel-service');
const { convertPdfToWord } = require('../services/pdfToword-service');
const { convertPdfToJpg, PdfPageSelectionError } = require('../services/pdfToJpg-service');
const { convertPdfToPng } = require('../services/pdfToPng-service');
const { convertPdfToPpt } = require('../services/pdfTopowerpoint-service');
const { convertExcelToPdf } = require('../services/excelTopdf-service');
const { convertExcelToWord } = require('../services/excelTOword-service');
const { convertExcelToPpt } = require('../services/excelTOpowerpoint-service');
const { mergePdfs, safeUnlink } = require('../services/pdf-merger-service');
const { makeZip } = require('../services/zip-service');
const { verifyOutputFormat, OutputFormatError } = require('../services/format-contract');
const { splitPdf } = require('../services/pdf-splitter-service');
const { convertImagesToPdf } = require('../services/imageToPdf-service');
const { organizePdf } = require('../services/pdf-organizer-service');
const { PageSelectionError } = require('../services/page-selection');
const { compressPdf, CompressionOptionsError } = require('../services/pdf-compressor-service');
const { ExportOptionsError } = require('../services/pdf-export-options');
const { recordConversion } = require('../services/conversion-history');

function conversion(service, convert, { multiple = false, minimum = 1, name } = {}) {
  return async (req, res) => {
    const files = req.files || (req.file ? [req.file] : []);
    let output;
    try {
      if (files.length < minimum) return res.status(400).json({ error: `Upload at least ${minimum} file(s).` });
      output = await convert(multiple ? files : files[0].path, req, files);
      const { extension, contentType } = await verifyOutputFormat(service, output);
      const base = name || path.parse(path.basename((files[0].originalname || 'converted').replace(/\\/g, '/'))).name;
      const pageSuffix = (service === 'pdf-to-jpg' || service === 'pdf-to-png') && Number(req.body.page || 1) > 1
        ? `-page-${String(req.body.page).padStart(3, '0')}` : '';
      const downloadName = `${base}${pageSuffix}.${extension}`;
      res.set({ 'Content-Type': contentType, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' });
      let downloadError = null;
      await new Promise((resolve) => res.download(output, downloadName, (error) => {
        downloadError = error;
        if (error && !res.headersSent && !res.destroyed) res.status(500).json({ error: 'Download failed.' });
        resolve();
      }));
      await recordConversion({ user: req.user, files, service, outputFormat: extension, status: downloadError ? 'failed' : 'success' });
    } catch (error) {
      // Log the *actual* exception privately. Previously only error.name was
      // recorded, making all converter regressions look like invalid PDFs.
      const errorId = randomUUID();
      console.error('[conversion-error]', {
        errorId, service, name: error?.name || 'Error',
        message: error?.message || String(error),
        stack: error?.stack,
      });
      let status = 500;
      let message = 'The conversion server encountered an error. Please retry and share the reference ID if it continues.';
      if (error instanceof OutputFormatError) {
        message = 'The server produced an invalid output file. No file was downloaded.';
      } else if (error instanceof PdfPageSelectionError || error instanceof PageSelectionError ||
                 error instanceof CompressionOptionsError || error instanceof ExportOptionsError) {
        status = 400;
        message = error.message;
      } else if (['InvalidPDFException', 'PasswordException', 'MissingPDFException',
                  'InvalidFileException', 'UnexpectedResponseException'].includes(error?.name) ||
                 /^(?:Invalid Excel file|Failed to parse PDF document)/i.test(error?.message || '') ||
                 /No PDF header found/i.test(error?.message || '')) {
        status = 422;
        message = 'The file could not be read. Check that it is valid and not password-protected.';
      }
      if (!res.headersSent && !res.destroyed) res.status(status).json({ error: message, errorId });
      await recordConversion({ user: req.user, files, service, status: 'failed' });
    } finally {
      files.forEach((file) => safeUnlink(file.path));
      safeUnlink(output);
    }
  };
}

exports.pdfToExcel = conversion('pdf-to-excel', convertPdfToExcel);
exports.pdfToWord = conversion('pdf-to-word', convertPdfToWord);
exports.pdfToJpg = conversion('pdf-to-jpg', (inputPath, req) => convertPdfToJpg(inputPath, req.body.page ?? '1', { scale: req.body.scale ?? '2', quality: req.body.quality ?? '90' }));
exports.pdfToPng = conversion('pdf-to-png', (inputPath, req) => convertPdfToPng(inputPath, req.body.page ?? '1', { scale: req.body.scale ?? '2' }));
exports.pdfToPpt = conversion('pdf-to-ppt', convertPdfToPpt);
exports.excelToPdf = conversion('excel-to-pdf', (inputPath, req) => convertExcelToPdf(inputPath, { paperSize: req.body.paperSize ?? 'A4', orientation: req.body.orientation ?? 'auto' }));
exports.excelToWord = conversion('excel-to-word', convertExcelToWord);
exports.excelToPpt = conversion('excel-to-ppt', convertExcelToPpt);
exports.pdfMerger = conversion('pdf-merger', (files) => mergePdfs(files.map((file) => file.path)), { multiple: true, minimum: 2, name: 'merged' });
exports.zipMaker = conversion('zip-maker', makeZip, { multiple: true, name: 'archive' });
exports.pdfSplitter = conversion('pdf-splitter', (inputPath, req) => splitPdf(inputPath, req.body.pages), { name: 'split' });
exports.imageToPdf = conversion('image-to-pdf', (files) => convertImagesToPdf(files), { multiple: true, minimum: 1, name: 'images' });
exports.pdfOrganizer = conversion('pdf-organizer', (inputPath, req) => organizePdf(inputPath, req.body.pages, req.body.rotate), { name: 'organized' });

exports.pdfCompressor = conversion('pdf-compressor', (inputPath, req) => compressPdf(inputPath, req.body.level || 'lossless'), { name: 'compressed' });
