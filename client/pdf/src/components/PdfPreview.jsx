import { useEffect, useRef, useState } from "react";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// PDF.js renders onto a canvas rather than relying on Android/iOS browsers to
// display PDFs inside iframes (often shown as an unhelpful 'Open' button).
// Parsing and rendering happen locally; nothing is uploaded for the preview.
export default function PdfPreview({ file }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const documentRef = useRef(null);
  const activeRenderRef = useRef(null);
  const [width, setWidth] = useState(320);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [status, setStatus] = useState("loading");
  const [rendering, setRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const measure = () => setWidth(Math.max(1, Math.floor(container.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let disposed = false;
    let loadingTask;
    let loadedDoc;
    setPageNumber(1);
    setPageCount(0);
    setErrorMessage("");
    setStatus("loading");
    setRendering(false);

    (async () => {
      const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (disposed) return;
      loadingTask = pdfjs.getDocument({ data: bytes, useSystemFonts: true });
      loadedDoc = await loadingTask.promise;
      if (disposed) return;
      documentRef.current = loadedDoc;
      setPageCount(loadedDoc.numPages);
      setStatus("ready");
    })().catch((error) => {
      if (disposed) return;
      setErrorMessage(error?.name === "PasswordException"
        ? "This PDF is password-protected. Unlock it before previewing."
        : "This PDF couldn't be previewed in your browser. You can still try converting it.");
      setStatus("error");
    });

    return () => {
      disposed = true;
      documentRef.current = null;
      // PDFDocumentLoadingTask.destroy() also disposes the loaded document.
      if (loadingTask) loadingTask.destroy().catch(() => {});
      else if (loadedDoc) loadedDoc.destroy().catch(() => {});
    };
  }, [file]);

  useEffect(() => {
    const pdf = documentRef.current;
    const canvas = canvasRef.current;
    if (status !== "ready" || !pdf || !canvas || !pageCount || !width) return undefined;
    let disposed = false;
    let renderTask;
    setRendering(true);
    setErrorMessage("");

    (async () => {
      // Ensure the prior canvas render has stopped before starting a new one.
      if (activeRenderRef.current) await activeRenderRef.current.promise.catch(() => {});
      if (disposed) return;
      const page = await pdf.getPage(pageNumber);
      if (disposed) return;
      const original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, width / original.width) });
      const preferredRatio = Math.min(window.devicePixelRatio || 1, 2);
      // Cap bitmap memory for mobile browsers, especially for tall PDF pages.
      const pixelRatio = Math.max(0.25, Math.min(preferredRatio, Math.sqrt(3_000_000 / (viewport.width * viewport.height))));
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas 2D context is unavailable");
      renderTask = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
        background: "#ffffff",
      });
      activeRenderRef.current = renderTask;
      await renderTask.promise;
      if (!disposed) setRendering(false);
    })().catch((error) => {
      if (disposed || error?.name === "RenderingCancelledException") return;
      setErrorMessage("Couldn't draw this page. Try another page or open the PDF in a separate tab.");
      setRendering(false);
    });

    return () => {
      disposed = true;
      if (renderTask) renderTask.cancel();
    };
  }, [pageNumber, pageCount, width, status]);

  const previousPage = () => setPageNumber((page) => Math.max(1, page - 1));
  const nextPage = () => setPageNumber((page) => Math.min(pageCount, page + 1));

  return (
    <div className="pdf-preview" aria-label={`PDF preview of ${file.name}`}>
      <div className="pdf-preview__viewport" ref={containerRef}>
        {status === "loading" && <p className="pdf-preview__message" role="status">Preparing document preview…</p>}
        {status === "error" && <p className="pdf-preview__message" role="alert">{errorMessage}</p>}
        {status === "ready" && (
          <>
            <canvas
              key={pageNumber}
              ref={canvasRef}
              className="pdf-preview__canvas"
              aria-label={`Page ${pageNumber} of ${pageCount} of ${file.name}`}
              role="img"
              style={{ visibility: rendering ? "hidden" : "visible" }}
            />
            {rendering && <p className="pdf-preview__message" role="status">Rendering page {pageNumber}…</p>}
            {errorMessage && <p className="pdf-preview__message" role="alert">{errorMessage}</p>}
          </>
        )}
      </div>
      {status === "ready" && pageCount > 0 && (
        <div className="pdf-preview__controls" aria-label="PDF preview pages">
          <button type="button" onClick={previousPage} disabled={pageNumber <= 1} aria-label="Previous PDF page">Previous</button>
          <span aria-live="polite">Page {pageNumber} of {pageCount}</span>
          <button type="button" onClick={nextPage} disabled={pageNumber >= pageCount} aria-label="Next PDF page">Next</button>
        </div>
      )}
      <p className="pdf-preview__privacy">Previewed on your device. Your file is only sent to the server when you start conversion.</p>
    </div>
  );
}
