import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  OCR_MAX_FILE_BYTES, OCR_MAX_IMAGE_BYTES, OCR_MAX_PAGES, OCR_MAX_PIXELS,
  isSupportedOcrFile, isImageOcrFile, selectedOcrPages, boundedPageScale, boundedImageDimensions,
  safeOcrText, assembleOcrText, textDownloadName,
} from "../src/utils/ocrLimits.js";

test("OCR input is limited to nonempty PDFs under 20MB", () => {
  assert.ok(isSupportedOcrFile({ name: "scan.PDF", size: 1024 }));
  assert.equal(isSupportedOcrFile({ name: "text.txt", size: 1024 }), false);
  assert.equal(isSupportedOcrFile({ name: "empty.pdf", size: 0 }), false);
  assert.equal(isSupportedOcrFile({ name: "large.pdf", size: OCR_MAX_FILE_BYTES + 1 }), false);
});

test("OCR pages are limited to the first five and pixel budget caps canvas scale", () => {
  assert.deepEqual(selectedOcrPages(2), [1, 2]);
  assert.deepEqual(selectedOcrPages(90), [1, 2, 3, 4, 5]);
  assert.equal(selectedOcrPages(0).length, 0);
  assert.equal(OCR_MAX_PAGES, 5);
  const scale = boundedPageScale(600, 800, 2);
  assert.ok(600 * 800 * scale * scale <= OCR_MAX_PIXELS + 1);
  assert.throws(() => boundedPageScale(0, 800));
});

test("OCR output is bounded, editable by page and filenames are safe", () => {
  assert.equal(safeOcrText("a\u0000b"), "ab");
  assert.equal(safeOcrText("x".repeat(130000)).length, 120000);
  assert.match(assembleOcrText([{ page: 1, text: "Heading" }, { page: 2, text: "Body" }]), /Page 1[\s\S]+Page 2/);
  assert.equal(textDownloadName("../../private/my scan.pdf"), "my scan-ocr.txt");
  assert.equal(textDownloadName("résumé.pdf"), "r_sum_-ocr.txt");
});

test("OCR UI runs separately; only explicit Word export posts reviewed text, not PDF bytes", async () => {
  const source = await readFile(new URL("../src/components/OcrWorkspace.jsx", import.meta.url), "utf8");
  assert.match(source, /import\("tesseract.js"\)/);
  assert.match(source, /worker\.recognize\(canvas, \{\}, \{ tsv: true \}\)/);
  assert.match(source, /worker\?\.terminate\(\)/);
  assert.match(source, /loading\?\.destroy\(\)/);
  assert.match(source, /Download editable TXT/);
  assert.match(source, /api\/ocr\/word/);
  assert.match(source, /body: JSON.stringify\(\{ pages: pages.map/);
  assert.match(source, /The original scanned PDF or photo stays on your device/);
  assert.doesNotMatch(source, /FormData|XMLHttpRequest/);
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /path="\/ocr"/);
});


test("camera photos are accepted as image OCR inputs without relaxing PDF limits", () => {
  assert.ok(isSupportedOcrFile({ name: "photo.jpg", type: "image/jpeg", size: 1024 }));
  assert.ok(isSupportedOcrFile({ name: "photo.PNG", type: "image/png", size: 2048 }));
  assert.ok(isSupportedOcrFile({ name: "scan.webp", type: "image/webp", size: 1024 }));
  assert.equal(isSupportedOcrFile({ name: "photo.jpg", type: "image/jpeg", size: OCR_MAX_IMAGE_BYTES + 1 }), false);
  assert.equal(isSupportedOcrFile({ name: "photo.exe", type: "image/jpeg", size: 1024 }), false);
  assert.equal(isImageOcrFile({ name: "photo.jpg", type: "application/pdf", size: 1024 }), false);
  assert.equal(isSupportedOcrFile({ name: "data.pdf", type: "image/jpeg", size: 1024 }), false);
  assert.equal(textDownloadName("camera-photo.jpg"), "camera-photo-ocr.txt");
  assert.equal(textDownloadName("scan.png", "pdf"), "scan-ocr.pdf");
});

test("large photos are downscaled before recognition to protect browser memory", () => {
  const dimensions = boundedImageDimensions(6000, 4000);
  assert.ok(dimensions.width * dimensions.height <= OCR_MAX_PIXELS);
  assert.equal(boundedImageDimensions(600, 400).width, 600);
  assert.throws(() => boundedImageDimensions(0, 400));
  assert.throws(() => boundedImageDimensions(200000, 400));
});

test("camera permission is user-initiated, preview streams are stopped, no live upload", async () => {
  const camera = await readFile(new URL("../src/components/OcrCameraInput.jsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/components/OcrWorkspace.jsx", import.meta.url), "utf8");
  assert.match(camera, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(camera, /track\.stop\(\)/);
  assert.match(camera, /capture="environment"/);
  assert.match(camera, /const capture = async/);
  assert.match(camera, /onPhoto\(photo\)/);
  assert.doesNotMatch(camera, /fetch\s*\(|XMLHttpRequest|FormData/);
  assert.match(workspace, /<OcrCameraInput onPhoto=\{chooseFile\}/);
  assert.match(workspace, /decodeOcrPhoto\(file\)/);
  assert.match(workspace, /makeSearchablePdfFromPhoto\(photoJpeg, pages\[0\]\)/);
});
