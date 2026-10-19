import { useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiArrowRight, FiRotateCw, FiTrash2, FiRefreshCw, FiMove } from 'react-icons/fi';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { VISUAL_PAGE_LIMIT, createPagePlan, movePage, removePage, rotatePage, serializePlan } from '../utils/organizerPlan';

// A local-only, mobile-friendly PDF editor. PDF.js renders thumbnails on the
// device; the existing /pdf-organizer backend still makes the final PDF.
export default function VisualPdfOrganizer({ file, disabled = false, onPlanChange, onReadyChange }) {
  const [pages, setPages] = useState([]);
  const [thumbnails, setThumbnails] = useState({});
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('Reading your PDF…');
  const [totalPages, setTotalPages] = useState(0);
  const dragIndex = useRef(null);
  const initialPlanRef = useRef([]);
  const callbacks = useRef({ onPlanChange, onReadyChange });
  callbacks.current = { onPlanChange, onReadyChange };

  useEffect(() => {
    let disposed = false;
    let loadingTask;
    const previousThumbs = new Map();
    setPages([]);
    setThumbnails({});
    setTotalPages(0);
    setStatus('loading');
    setMessage('Reading your PDF…');
    initialPlanRef.current = [];
    callbacks.current.onReadyChange(false, 'loading');

    (async () => {
      const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const data = new Uint8Array(await file.arrayBuffer());
      if (disposed) return;
      loadingTask = pdfjs.getDocument({ data, useSystemFonts: true });
      const doc = await loadingTask.promise;
      if (disposed) return;
      const count = doc.numPages;
      setTotalPages(count);
      if (count > VISUAL_PAGE_LIMIT) {
        const allPages = `1-${count}`;
        callbacks.current.onPlanChange({ pages: allPages, rotate: '' });
        callbacks.current.onReadyChange(true, 'manual');
        setStatus('fallback');
        setMessage(`This PDF has ${count} pages. For smooth performance, the thumbnail editor supports up to ${VISUAL_PAGE_LIMIT}. Use the page-order fields below instead.`);
        return;
      }

      const rotations = [];
      // Read rotation as well as content so a 90° turn remains correct even
      // when the source document already contains rotated pages.
      for (let i = 1; i <= count; i++) {
        if (disposed) return;
        const page = await doc.getPage(i);
        rotations.push(page.rotate);
      }
      const initial = createPagePlan(count, rotations);
      if (disposed) return;
      initialPlanRef.current = initial;
      setPages(initial);
      callbacks.current.onPlanChange(serializePlan(initial));
      callbacks.current.onReadyChange(true, 'visual');
      setStatus('ready');
      setMessage('');

      // Thumbnails are generated one by one to bound memory and allow the UI
      // to be interactive before every page is drawn.
      for (let i = 1; i <= count; i++) {
        if (disposed) return;
        const page = await doc.getPage(i);
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: Math.min(1, 145 / original.width) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas is unavailable');
        await page.render({ canvasContext: context, canvas, viewport, background: '#ffffff' }).promise;
        if (disposed) return;
        const thumb = canvas.toDataURL('image/jpeg', 0.72);
        previousThumbs.set(i, thumb);
        setThumbnails((current) => ({ ...current, [i]: thumb }));
        canvas.width = 0;
        canvas.height = 0;
      }
    })().catch((error) => {
      if (disposed) return;
      callbacks.current.onReadyChange(true, 'manual');
      setStatus('error');
      setMessage(error?.name === 'PasswordException'
        ? 'This PDF is password-protected. Unlock it before editing.'
        : 'Unable to open the visual PDF editor. You can use manual page-order fields below.');
    });

    return () => {
      disposed = true;
      if (loadingTask) loadingTask.destroy().catch(() => {});
      previousThumbs.clear();
    };
  }, [file]);

  const updatePlan = (next) => {
    if (disabled || next === pages) return;
    setPages(next);
    callbacks.current.onPlanChange(serializePlan(next));
  };

  const onDragStart = (event, index) => {
    if (disabled) return;
    dragIndex.current = index;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  };
  const onDrop = (event, index) => {
    event.preventDefault();
    if (disabled) return;
    const source = dragIndex.current;
    dragIndex.current = null;
    if (Number.isInteger(source)) updatePlan(movePage(pages, source, index));
  };

  return (
    <section className="organizer-visual" aria-label="Visual PDF page organizer">
      <div className="organizer-visual__heading">
        <div><h3>Visual page editor</h3><p>Move, rotate or remove pages. Changes are applied when you select Organize PDF.</p></div>
        {status === 'ready' && <button type="button" className="organizer-visual__reset" disabled={disabled} onClick={() => updatePlan([...initialPlanRef.current])}><FiRefreshCw aria-hidden="true" /> Reset</button>}
      </div>
      {status === 'loading' && <p className="organizer-visual__notice" role="status">{message}</p>}
      {status === 'error' && <p className="organizer-visual__notice" role="alert">{message}</p>}
      {status === 'fallback' && <p className="organizer-visual__notice" role="status">{message}</p>}
      {status === 'ready' && (
        <>
          <p className="organizer-visual__count" aria-live="polite">{pages.length} of {totalPages} pages kept</p>
          <div className="organizer-visual__grid">
            {pages.map((item, index) => (
              <div
                key={item.page}
                className="organizer-visual__page"
                draggable={!disabled}
                onDragStart={(event) => onDragStart(event, index)}
                onDragOver={(event) => { if (!disabled) event.preventDefault(); }}
                onDrop={(event) => onDrop(event, index)}
                onDragEnd={() => { dragIndex.current = null; }}
              >
                <div className="organizer-visual__thumb" aria-label={`Source PDF page ${item.page}`}>
                  {thumbnails[item.page]
                    ? <img src={thumbnails[item.page]} alt={`PDF page ${item.page}`} loading="lazy" style={{ transform: `rotate(${(item.rotation - item.originalRotation + 360) % 360}deg)` }} />
                    : <span aria-hidden="true">Page {item.page}</span>}
                </div>
                <strong>Page {item.page}</strong>
                <small>Position {index + 1}</small>
                <div className="organizer-visual__actions">
                  <button type="button" title="Move left" aria-label={`Move page ${item.page} earlier`} disabled={disabled || index === 0} onClick={() => updatePlan(movePage(pages, index, index - 1))}><FiArrowLeft /></button>
                  <button type="button" title="Move right" aria-label={`Move page ${item.page} later`} disabled={disabled || index === pages.length - 1} onClick={() => updatePlan(movePage(pages, index, index + 1))}><FiArrowRight /></button>
                  <button type="button" title="Rotate clockwise" aria-label={`Rotate page ${item.page} clockwise`} disabled={disabled} onClick={() => updatePlan(rotatePage(pages, item.page))}><FiRotateCw /></button>
                  <button type="button" title="Remove page" aria-label={`Remove page ${item.page}`} disabled={disabled || pages.length <= 1} onClick={() => updatePlan(removePage(pages, item.page))}><FiTrash2 /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="organizer-visual__footer"><FiMove aria-hidden="true" /> Drag thumbnails on desktop or use the arrow buttons on mobile. At least one page must remain.</div>
        </>
      )}
    </section>
  );
}
