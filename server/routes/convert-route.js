const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("node:crypto");
const { safeUnlink } = require("../services/pdf-merger-service");
const { buildConversionGuardFromEnv } = require('../middleware/conversion-guard');
const { optionalProtect } = require('../middleware/authMiddleware');
const {
  pdfToExcel,
  pdfToWord,
  pdfToJpg,
  pdfToPng,
  pdfToPpt,
  excelToPdf,
  excelToWord,
  excelToPpt,
  pdfMerger,
  zipMaker,
  pdfSplitter,
  imageToPdf,
  pdfOrganizer,
  pdfCompressor,
} = require("../controller/convert-controller");

const router = express.Router();

// Ensure 'uploads' folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const singlePdfRoutes = new Set(['/pdf-to-excel', '/pdf-to-word', '/pdf-to-jpg', '/pdf-to-png', '/pdf-to-ppt', '/pdf-splitter', '/pdf-organizer', '/pdf-compressor']);
const singleExcelRoutes = new Set(['/excel-to-pdf', '/excel-to-word', '/excel-to-ppt']);
const imageToPdfExtensions = new Set(['.jpg', '.jpeg', '.png']);

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, randomUUID() + path.extname(file.originalname).toLowerCase()),
});

// Multer upload instance
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    let allowed = false;
    if (req.path === '/zip-maker') allowed = true;
    else if (req.path === '/image-to-pdf') allowed = imageToPdfExtensions.has(extension);
    else if (singleExcelRoutes.has(req.path)) allowed = ['.xlsx', '.xls'].includes(extension);
    else if (singlePdfRoutes.has(req.path) || req.path === '/pdf-merger') allowed = extension === '.pdf';
    cb(allowed ? null : new Error('Upload a file matching the selected conversion.'), allowed);
  },
});

router.use(...buildConversionGuardFromEnv());
router.use(optionalProtect);

// Single-file conversion routes
router.post('/pdf-to-excel', upload.single('file'), pdfToExcel);
router.post('/pdf-to-word', upload.single('file'), pdfToWord);
router.post('/pdf-to-jpg', upload.single('file'), pdfToJpg);
router.post('/pdf-to-png', upload.single('file'), pdfToPng);
router.post('/pdf-to-ppt', upload.single('file'), pdfToPpt);
router.post('/excel-to-pdf', upload.single('file'), excelToPdf);
router.post('/excel-to-word', upload.single('file'), excelToWord);
router.post('/excel-to-ppt', upload.single('file'), excelToPpt);
router.post('/pdf-splitter', upload.single('file'), pdfSplitter);
router.post('/pdf-organizer', upload.single('file'), pdfOrganizer);
router.post('/pdf-compressor', upload.single('file'), pdfCompressor);

// Multiple-file routes
router.post('/pdf-merger', upload.array('files', 10), pdfMerger);
router.post('/zip-maker', upload.array('files', 20), zipMaker);
router.post('/image-to-pdf', upload.array('files', 30), imageToPdf);

router.use((error, req, res, next) => {
  const files = req.files || (req.file ? [req.file] : []);
  files.forEach((file) => safeUnlink(file.path));
  if (res.headersSent) return next(error);
  const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
  res.status(status).json({
    error: status === 413
      ? 'Maximum file size is 50 MB.'
      : 'Upload valid files for the selected conversion and check the file count.',
  });
});

module.exports = router;
