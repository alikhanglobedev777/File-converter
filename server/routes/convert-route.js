const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {
  pdfToExcel,
  pdfToWord,
  pdfToJpg,
  pdfToPpt,
  excelToPdf,
  excelToWord,
  excelToPpt,
  pdfMerger,
  zipMaker
} = require("../controller/convert-controller");

const router = express.Router();

// Ensure 'uploads' folder exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use timestamp + original name to avoid conflicts
    cb(null, Date.now() + "-" + file.originalname);
  }
});

// Multer upload instance
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB limit
});

// ========================
// Single File Routes
// ========================
router.post("/pdf-to-excel", upload.single("file"), pdfToExcel);
router.post("/pdf-to-word", upload.single("file"), pdfToWord);
router.post("/pdf-to-jpg", upload.single("file"), pdfToJpg);
router.post("/pdf-to-ppt", upload.single("file"), pdfToPpt);
router.post("/excel-to-pdf", upload.single("file"), excelToPdf);
router.post("/excel-to-word", upload.single("file"), excelToWord);
router.post("/excel-to-ppt", upload.single("file"), excelToPpt);

// ========================
// Multiple File Routes
// ========================

// PDF Merger (accepts 2–10 files)
router.post("/pdf-merger", upload.array("files", 10), pdfMerger);

// ZIP Maker (accepts 1–20 files)
router.post("/zip-maker", upload.array("files", 20), zipMaker);

module.exports = router;
