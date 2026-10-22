import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiDownload, FiFileText, FiInfo, FiX } from "react-icons/fi";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  OCR_MAX_FILE_BYTES, OCR_MAX_IMAGE_BYTES, OCR_MAX_PAGES, isSupportedOcrFile,
  isImageOcrFile, boundedPageScale, boundedImageDimensions,
  safeOcrText, assembleOcrText, selectedOcrPages, textDownloadName,
} from "../utils/ocrLimits";
import "./OcrWorkspace.css";
import { validateDownload } from "../utils/downloadFormat";
import { parseOcrTsv, makeSearchablePdf, makeSearchablePdfFromPhoto } from "../utils/ocrPdfExport";
import { decodeOcrPhoto, drawablePhoto } from "../utils/ocrPhoto";
import OcrCameraInput from "./OcrCameraInput.jsx";
const OcrTableEditor = lazy(() => import("./OcrTableEditor.jsx"));
const DocumentPhotoEnhancer = lazy(() => import("./DocumentPhotoEnhancer.jsx"));

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function OcrWorkspace() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [pages, setPages] = useState([]);
  const [running, setRunning] = useState(false);
  const [pageProgress, setPageProgress] = useState(null);
  const [partial, setPartial] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [photoJpeg, setPhotoJpeg] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [enhancerOpen, setEnhancerOpen] = useState(false);
  const generationRef = useRef(0);
  const workerRef = useRef(null);
  const loadingRef = useRef(null);

  const abort = () => {
    generationRef.current += 1;
    const worker = workerRef.current;
    workerRef.current = null;
    worker?.terminate().catch(() => {});
    const loading = loadingRef.current;
    loadingRef.current = null;
    loading?.destroy().catch(() => {});
  };
  useEffect(() => () => { abort(); }, []);

  useEffect(() => {
    if (!isImageOcrFile(file)) {
      setPhotoPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
    return () => { URL.revokeObjectURL(url); setPhotoPreview(""); };
  }, [file]);

  const chooseFile = (item) => {
    abort();
    setRunning(false);
    setFile(null);
    setEnhancerOpen(false);
    setPhotoJpeg(null);
    setPages([]);
    setShowTableEditor(false);
    setPartial(false);
    setStatus("");
    setError("");
    setPageProgress(null);
    if (!item) return;
    if (!isSupportedOcrFile(item)) {
      setError("Choose a PDF under " + Math.round(OCR_MAX_FILE_BYTES / 1048576) +
        " MB or a JPEG, PNG, or WebP photo under " +
        Math.round(OCR_MAX_IMAGE_BYTES / 1048576) + " MB.");
      return;
    }
    setFile(item);
  };

  const runOcr = async () => {
    if (!file || running) return;
    const run = ++generationRef.current;
    setRunning(true);
    setError("");
    setPages([]);
    setPhotoJpeg(null);
    setShowTableEditor(false);
    setPartial(false);
    setPageProgress(null);
    setStatus(isImageOcrFile(file) ? "Preparing your photo on this device…" : "Opening PDF on your device…");
    let worker = null;
    let loading = null;
    try {
      if (isImageOcrFile(file)) {
        const decoded = await decodeOcrPhoto(file);
        let canvas = null;
        try {
          if (run !== generationRef.current) return;
          const { width, height } = boundedImageDimensions(decoded.width, decoded.height);
          canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) throw new Error("Canvas unavailable");
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, width, height);
          context.drawImage(drawablePhoto(decoded), 0, 0, width, height);
          setStatus("Loading English OCR into your browser…");
          const { createWorker } = await import("tesseract.js");
          if (run !== generationRef.current) return;
          worker = await createWorker("eng", 1, {
            logger: detail => {
              if (run !== generationRef.current) return;
              if (detail.status === "recognizing text" && Number.isFinite(detail.progress)) {
                setPageProgress(Math.round(detail.progress * 100));
              }
            },
          });
          if (run !== generationRef.current) return;
          workerRef.current = worker;
          setStatus("Recognizing photo text…");
          const result = await worker.recognize(canvas, {}, { tsv: true });
          if (run !== generationRef.current) return;
          const jpeg = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
          if (!jpeg) throw new Error("Could not prepare photo PDF background");
          if (run !== generationRef.current) return;
          setPhotoJpeg(jpeg);
          setPages([{ page: 1, text: safeOcrText(result.data.text),
            method: "OCR recognition",
            words: parseOcrTsv(result.data.tsv),
            dimensions: { width, height } }]);
          setStatus("Photo recognized. Review the text or download a document.");
        } finally {
          if (canvas) { canvas.width = 0; canvas.height = 0; }
          decoded.close?.();
        }
        return;
      }

      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      if (run !== generationRef.current) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const buffer = new Uint8Array(await file.arrayBuffer());
      if (run !== generationRef.current) return;
      loading = pdfjs.getDocument({ data: buffer, isEvalSupported: false, useSystemFonts: true });
      loadingRef.current = loading;
      const pdf = await loading.promise;
      if (run !== generationRef.current) return;
      const numbers = selectedOcrPages(pdf.numPages);
      setPartial(pdf.numPages > numbers.length);
      const results = [];
      for (const n of numbers) {
        if (run !== generationRef.current) return;
        setStatus("Reading page " + n + " of " + pdf.numPages + "…");
        setPageProgress(null);
        const page = await pdf.getPage(n);
        try {
          const content = await page.getTextContent();
          if (run !== generationRef.current) return;
          let text = content.items.map(item => item.str || "").join(" ").trim();
          let method = "Selectable PDF text";
          let words = [];
          let dimensions = null;
          if (text.replace(/\s/g, "").length < 24) {
            method = "OCR recognition";
            if (!worker) {
              setStatus("Loading English OCR into your browser…");
              const { createWorker } = await import("tesseract.js");
              if (run !== generationRef.current) return;
              worker = await createWorker("eng", 1, {
                logger: detail => {
                  if (run !== generationRef.current) return;
                  if (detail.status === "recognizing text" && Number.isFinite(detail.progress)) {
                    setPageProgress(Math.round(detail.progress * 100));
                  }
                },
              });
              if (run !== generationRef.current) {
                await worker.terminate();
                worker = null;
                return;
              }
              workerRef.current = worker;
            }
            const viewport = page.getViewport({ scale: 1 });
            const scale = boundedPageScale(viewport.width, viewport.height);
            const rendered = page.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.floor(rendered.width));
            canvas.height = Math.max(1, Math.floor(rendered.height));
            try {
              const context = canvas.getContext("2d", { alpha: false });
              if (!context) throw new Error("Canvas unavailable");
              setStatus("Recognizing page " + n + " of " + pdf.numPages + "…");
              await page.render({ canvas, canvasContext: context, viewport: rendered,
                background: "#ffffff" }).promise;
              if (run !== generationRef.current) return;
              const recognized = await worker.recognize(canvas, {}, { tsv: true });
              if (run !== generationRef.current) return;
              text = recognized.data.text || "";
              words = parseOcrTsv(recognized.data.tsv);
              dimensions = { width: canvas.width, height: canvas.height };
            } finally {
              canvas.width = 0;
              canvas.height = 0;
            }
          }
          results.push({ page: n, text: safeOcrText(text), method, words, dimensions });
          if (run === generationRef.current) setPages([...results]);
        } finally {
          page.cleanup();
        }
      }
      if (run === generationRef.current) {
        setStatus("Finished " + results.length + " of " + pdf.numPages +
          " pages. Review the recognized text before download.");
      }
    } catch (err) {
      if (run === generationRef.current) {
        setError(err?.name === "PasswordException"
          ? "Unlock this password-protected PDF before OCR."
          : "Unable to recognize this PDF. Try a smaller, clearer scan or another browser.");
        setStatus("");
      }
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      if (workerRef.current === worker) workerRef.current = null;
      if (loading) await loading.destroy().catch(() => {});
      if (loadingRef.current === loading) loadingRef.current = null;
      if (run === generationRef.current) {
        setRunning(false);
        setPageProgress(null);
      }
    }
  };

  // Opt-in export: only reviewed text, not the PDF, is sent to Express.
  const exportWord = async () => {
    if (!pages.length || running || exportingWord) return;
    setExportingWord(true);
    setError("");
    try {
      const response = await fetch(API_BASE_URL + "/api/ocr/word", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: pages.map(({ page, text }) => ({ page, text })) }),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.error || "Word export failed.");
      }
      const blob = await response.blob();
      const output = await validateDownload("ocr-to-word", response, blob, file?.name);
      saveBlob(blob, output.filename);
    } catch {
      setError("Could not export Word. Try fewer pages or download TXT instead.");
    } finally {
      setExportingWord(false);
    }
  };

  // Uses initial OCR word coordinates; review text changes cannot be aligned.
  const exportPdf = async () => {
    if (!file || running || exportingPdf || !pages.length || (isImageOcrFile(file) && !photoJpeg)) return;
    setExportingPdf(true);
    setError("");
    try {
      const blob = isImageOcrFile(file)
        ? await makeSearchablePdfFromPhoto(photoJpeg, pages[0])
        : await makeSearchablePdf(file, pages);
      await validateDownload("ocr-searchable-pdf", {
        headers: { get: name => name.toLowerCase() === "content-type" ? "application/pdf" : null },
      }, blob, file.name);
      saveBlob(blob, textDownloadName(file.name, "pdf"));
    } catch {
      setError("Could not create a searchable PDF. Try an unrotated, clearer scan or download Word.");
    } finally {
      setExportingPdf(false);
    }
  };

  const stopOcr = () => {
    abort();
    setRunning(false);
    setPageProgress(null);
    setStatus("OCR stopped. Text from completed pages is still available.");
  };
  const updatePage = (number, value) => setPages(items => items.map(item =>
    item.page === number ? { ...item, text: safeOcrText(value) } : item));

  return <div className="page ocr-page">
    <div className="page-heading">
      <div className="page-heading__trail"><Link to="/">All tools</Link><span>/</span><strong>Scanned PDF OCR</strong></div>
      <div className="page-heading__row"><div className="page-heading__title-group">
        <span className="eyebrow">OPTIONAL · RUNS ON YOUR DEVICE</span>
        <h1>Scan a document or PDF</h1>
        <p>Take a live photo, upload a picture, or select a PDF to extract editable text.</p>
      </div></div>
    </div>
    <div className="ocr-panel">
      <label htmlFor="ocr-file"><strong>Upload a PDF</strong> (up to 20 MB)</label>
      <input id="ocr-file" type="file" accept=".pdf,application/pdf" disabled={running}
        onChange={event => { chooseFile(event.target.files?.[0] || null); event.target.value = ""; }} />
      <OcrCameraInput onPhoto={chooseFile} selectedFile={file} disabled={running || exportingWord || exportingPdf} />
      <p><FiInfo aria-hidden="true" /> First {OCR_MAX_PAGES} PDF pages, or one photo. English printed text. Up to 20 MB per PDF or 10 MB per photo. Recognition happens on your device; the English OCR model downloads on first use.</p>
      {file && <p className="ocr-file"><FiFileText /> {file.name} · {(file.size / 1048576).toFixed(1)} MB · {isImageOcrFile(file) ? "Photo" : "PDF"}</p>}
      {photoPreview && <div className="ocr-photo-selected">
        <img className="ocr-photo-preview" src={photoPreview} alt="Selected document photo" />
        <button className="button button--primary" type="button" disabled={running}
          onClick={() => setEnhancerOpen(open => !open)}>
          {enhancerOpen ? "Close photo enhancer" : "Enhance photo before OCR"}
        </button>
      </div>}
      {enhancerOpen && isImageOcrFile(file) && <Suspense fallback={<p role="status">Opening photo enhancer…</p>}>
        <DocumentPhotoEnhancer file={file} onClose={() => setEnhancerOpen(false)}
          onApply={enhanced => { chooseFile(enhanced); setStatus("Enhanced photo ready. Click Recognize text."); }} />
      </Suspense>}
      {error && <p className="auth-status auth-status--error" role="alert">{error}</p>}
      {status && <p className="auth-status" role="status">{status}</p>}
      {partial && <p className="auth-status">Only the first {OCR_MAX_PAGES} pages were processed. This first release does not process the remaining pages.</p>}
      {pageProgress !== null && <progress value={pageProgress} max="100" aria-label="Current page OCR progress" />}
      <div className="ocr-actions">
        <button type="button" className="button button--primary" onClick={runOcr} disabled={!file || running}>
          {running ? "Processing…" : "Recognize text"}
        </button>
        {running && <button className="button" type="button" onClick={stopOcr}><FiX /> Cancel</button>}
      </div>
    </div>
    {pages.length > 0 && <section className="ocr-results" aria-label="OCR text review">
      <div className="ocr-results__heading"><div>
        <h2>Recognized text</h2>
        <p>Review and correct names, numbers and columns before downloading.</p>
      </div><button type="button" className="button button--primary" disabled={running}
        onClick={() => saveBlob(new Blob([assembleOcrText(pages)], { type: "text/plain;charset=utf-8" }), textDownloadName(file?.name))}>
          <FiDownload /> Download editable TXT
        </button>
        <button type="button" className="button" onClick={exportWord} disabled={running || exportingWord}>
          <FiDownload /> {exportingWord ? "Creating Word…" : "Download editable Word"}
        </button>
        {pages.some(item => item.words?.length > 0) && <button type="button" className="button"
          onClick={exportPdf} disabled={running || exportingPdf}>
          <FiDownload /> {exportingPdf ? "Creating searchable PDF…" : "Download searchable PDF"}
        </button>}
        <button type="button" className="button" onClick={() => setShowTableEditor(open => !open)}>
          {showTableEditor ? "Close Excel review" : "Review table for Excel"}
        </button></div>
      {pages.some(item => item.words?.length > 0) && <p className="ocr-export-privacy">Searchable PDF is created on your device and preserves original page or photo appearance. Its text uses initial OCR positions; textarea edits only affect TXT/Word.</p>}
      <p className="ocr-export-privacy">Word export sends only your reviewed text to the AK Converter server to create a DOCX. The original scanned PDF or photo stays on your device.</p>
      {pages.map(item => <div className="ocr-page-result" key={item.page}>
        <label htmlFor={"ocr-result-" + item.page}>Page {item.page} · {item.method}</label>
        <textarea id={"ocr-result-" + item.page} value={item.text}
          onChange={event => updatePage(item.page, event.target.value)} rows={8} maxLength={120000}
          spellCheck={false} />
      </div>)}
      {showTableEditor && <Suspense fallback={<p role="status">Opening table review…</p>}>
        <OcrTableEditor pages={pages} />
      </Suspense>}
    </section>}
    <p className="ocr-back"><Link to="/"><FiArrowLeft /> Back to all tools</Link></p>
  </div>;
}
