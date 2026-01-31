// controller/convert-controller.js

const fs = require("fs");
const path = require("path");

// Import services
const { convertPdfToExcel } = require("../services/pdfToExcel-service");
const { convertPdfToWord } = require("../services/pdfToword-service");
const { convertPdfToJpg } = require("../services/pdfToJpg-service");
const { convertPdfToPpt } = require("../services/pdfTopowerpoint-service");
const { convertExcelToPdf } = require("../services/excelTopdf-service");
const { convertExcelToWord } = require("../services/excelTOword-service");
const { convertExcelToPpt } = require("../services/excelTOpowerpoint-service");
const { mergePdfs, safeUnlink } = require("../services/pdf-merger-service");
const { makeZip } = require("../services/zip-service");

// Helper: get filename with new extension
const getOriginalName = (originalname, newExt) => {
  const baseName = path.parse(originalname).name;
  return `${baseName}.${newExt}`;
};

// ================= SINGLE FILE SERVICES =================

// PDF → Excel
exports.pdfToExcel = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const outputPath = await convertPdfToExcel(req.file.path);
    const downloadName = getOriginalName(req.file.originalname, "xlsx");

    res.download(outputPath, downloadName, (err) => {
      if (err) console.error("Excel download failed:", err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("PDF → Excel error:", err);
    res.status(500).json({ error: "PDF → Excel conversion failed" });
  }
};

// PDF → Word
exports.pdfToWord = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const outputPath = await convertPdfToWord(req.file.path);
    const downloadName = getOriginalName(req.file.originalname, "docx");

    res.download(outputPath, downloadName, (err) => {
      if (err) console.error("Word download failed:", err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("PDF → Word error:", err);
    res.status(500).json({ error: "PDF → Word conversion failed" });
  }
};

// PDF → JPG
exports.pdfToJpg = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const outputPath = await convertPdfToJpg(req.file.path);
    const downloadName = getOriginalName(req.file.originalname, "jpg");

    res.download(outputPath, downloadName, (err) => {
      if (err) console.error("JPG download failed:", err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("PDF → JPG error:", err);
    res.status(500).json({ error: "PDF → JPG conversion failed" });
  }
};

// PDF → PPT
exports.pdfToPpt = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const outputPath = await convertPdfToPpt(req.file.path);
    const downloadName = getOriginalName(req.file.originalname, "pptx");

    res.download(outputPath, downloadName, (err) => {
      if (err) console.error("PPT download failed:", err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("PDF → PPT error:", err);
    res.status(500).json({ error: "PDF → PPT conversion failed" });
  }
};

// Excel → PDF
exports.excelToPdf = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload an Excel file" });

    const outputPath = await convertExcelToPdf(req.file.path);

    res.download(outputPath, `converted-${Date.now()}.pdf`, (err) => {
      if (err) console.error(err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Excel → PDF conversion failed" });
  }
};

// Excel → Word
exports.excelToWord = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload an Excel file" });

    const outputPath = await convertExcelToWord(req.file.path);
    const downloadName = path.basename(outputPath);

    res.download(outputPath, downloadName, (err) => {
      if (err) console.error("Excel → Word download failed:", err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("Excel → Word error:", err);
    res.status(500).json({ error: "Excel → Word conversion failed" });
  }
};

// Excel → PPT
exports.excelToPpt = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload an Excel file" });

    const outputPath = await convertExcelToPpt(req.file.path);

    res.download(outputPath, `converted-${Date.now()}.pptx`, (err) => {
      if (err) console.error(err);
      safeUnlink(req.file.path);
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("Excel → PPT error:", err);
    res.status(500).json({ error: "Excel → PPT conversion failed" });
  }
};

// ================= MULTI-FILE SERVICES =================

// PDF Merger
exports.pdfMerger = async (req, res) => {
  try {
    // Validate uploaded files
    if (!req.files || req.files.length < 2) {
      return res.status(400).json({ error: "Upload at least 2 PDF files" });
    }

    const filePaths = req.files.map(f => f.path);
    console.log("Received PDFs:", filePaths);

    // Merge PDFs
    const outputPath = await mergePdfs(filePaths);

    // Send merged PDF as download
    res.download(outputPath, `merged-${Date.now()}.pdf`, (err) => {
      if (err) console.error("Download error:", err);

      // Cleanup: uploaded files + merged PDF
      req.files.forEach(f => safeUnlink(f.path));
      safeUnlink(outputPath);
    });

  } catch (err) {
    console.error("PDF Merger Error:", err);
    res.status(500).json({ error: "PDF merge failed", details: err.message });
  }
};

// ZIP Maker
exports.zipMaker = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: "Upload at least 1 file" });

    const outputPath = await makeZip(req.files, `archive-${Date.now()}.zip`);

    res.download(outputPath, `archive-${Date.now()}.zip`, (err) => {
      if (err) console.error("ZIP download failed:", err);
      req.files.forEach(f => safeUnlink(f.path));
      safeUnlink(outputPath);
    });
  } catch (err) {
    console.error("ZIP error:", err);
    res.status(500).json({ error: "ZIP creation failed" });
  }
};
