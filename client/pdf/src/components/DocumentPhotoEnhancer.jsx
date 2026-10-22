import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiDownload, FiMove, FiRefreshCw, FiSliders, FiX } from 'react-icons/fi';
import { decodeOcrPhoto, drawablePhoto } from '../utils/ocrPhoto';
import { boundedImageDimensions } from '../utils/ocrLimits';
import { enhanceDocumentPixels, PHOTO_PRESETS } from '../utils/documentEnhance';
import {
  detectDocumentCorners, insetDocumentCorners, isValidDocumentCorners, rectifyDocumentPixels,
} from '../utils/documentPerspective';

const labels = {
  original: 'Original colors', document: 'Document', grayscale: 'Grayscale', 'black-white': 'Black & white',
};
const names = ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
const JPEG_QUALITY = .92;

export default function DocumentPhotoEnhancer({ file, onApply, onClose }) {
  const canvasRef = useRef(null);
  const sourceRef = useRef(null);
  const selectionRef = useRef(null);
  const sizeRef = useRef(null);
  const dragRef = useRef(null);
  const generationRef = useRef(0);
  const [mode, setMode] = useState('document');
  const [strength, setStrength] = useState(70);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [originalUrl, setOriginalUrl] = useState('');
  const [selection, setSelection] = useState(null);
  const [cropCorners, setCropCorners] = useState(null);
  const [editing, setEditing] = useState(false);
  const [dimensions, setDimensions] = useState(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const run = ++generationRef.current;
    let decoded;
    (async () => {
      setError('');
      setNotice('');
      setReady(false);
      setCropCorners(null);
      setEditing(false);
      decoded = await decodeOcrPhoto(file);
      if (run !== generationRef.current) return;
      const size = boundedImageDimensions(decoded.width, decoded.height);
      const buffer = document.createElement('canvas');
      buffer.width = size.width;
      buffer.height = size.height;
      try {
        const context = buffer.getContext('2d', { willReadFrequently: true, alpha: false });
        if (!context) throw new Error('Canvas is unavailable');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, size.width, size.height);
        context.drawImage(drawablePhoto(decoded), 0, 0, size.width, size.height);
        const image = context.getImageData(0, 0, size.width, size.height);
        if (run !== generationRef.current) return;
        const found = detectDocumentCorners(image);
        const corners = found || insetDocumentCorners(size.width, size.height);
        sourceRef.current = image;
        sizeRef.current = size;
        selectionRef.current = corners;
        setDimensions(size);
        setSelection(corners);
        setCropCorners(found);
        setNotice(found
          ? 'Page detected and straightened. Adjust the four corners if needed.'
          : 'Automatic page detection was uncertain. The full photo is preserved; use Adjust corners to straighten it.');
        setReady(true);
      } finally {
        buffer.width = 0;
        buffer.height = 0;
      }
    })().catch(() => {
      if (run === generationRef.current) setError('Could not open this picture for enhancement.');
    }).finally(() => decoded?.close?.());
    return () => {
      generationRef.current++;
      sourceRef.current = null;
      sizeRef.current = null;
      selectionRef.current = null;
    };
  }, [file]);

  useEffect(() => {
    if (!ready || !sourceRef.current || !canvasRef.current) return undefined;
    const timer = window.requestAnimationFrame(() => {
      const base = sourceRef.current;
      const canvas = canvasRef.current;
      if (!base || !canvas) return;
      try {
        const framed = cropCorners ? rectifyDocumentPixels(base, cropCorners) : base;
        const filtered = {
          width: framed.width, height: framed.height,
          data: new Uint8ClampedArray(framed.data),
        };
        enhanceDocumentPixels(filtered, mode, strength);
        canvas.width = filtered.width;
        canvas.height = filtered.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas preview is unavailable');
        context.putImageData(new ImageData(filtered.data, filtered.width, filtered.height), 0, 0);
        setError('');
      } catch {
        setError('Unable to straighten this page. Adjust the four corners or keep the full photo.');
      }
    });
    return () => window.cancelAnimationFrame(timer);
  }, [ready, mode, strength, cropCorners]);

  const select = next => { selectionRef.current = next; setSelection(next); };

  const autoDetect = () => {
    if (!sourceRef.current || !sizeRef.current) return;
    const detected = detectDocumentCorners(sourceRef.current);
    if (!detected) {
      setNotice('Automatic page detection is uncertain. Use manual corner adjustment or keep the full photo.');
      return;
    }
    select(detected);
    setCropCorners(detected);
    setEditing(false);
    setNotice('Page corners detected and perspective corrected.');
  };

  const applyCorners = () => {
    const size = sizeRef.current, corners = selectionRef.current;
    if (!size || !isValidDocumentCorners(corners, size.width, size.height)) {
      setError('Please position four corners around a valid rectangular document.');
      return;
    }
    setError('');
    setCropCorners(corners.map(p => ({ ...p })));
    setEditing(false);
    setNotice('Page straightened and fitted to a rectangular frame.');
  };

  const startDrag = (event, index) => {
    if (!editing) return;
    event.preventDefault();
    dragRef.current = index;
    event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
  };
  const moveDrag = event => {
    const index = dragRef.current, size = sizeRef.current;
    if (index === null || !size || !selectionRef.current) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const x = Math.max(0, Math.min(size.width, (event.clientX - box.left) * size.width / box.width));
    const y = Math.max(0, Math.min(size.height, (event.clientY - box.top) * size.height / box.height));
    const next = selectionRef.current.map((p, i) => i === index ? { x, y } : p);
    select(next);
  };
  const finishDrag = () => { dragRef.current = null; };
  const updateCorner = (index, axis, percent) => {
    const size = sizeRef.current;
    if (!size || !Number.isFinite(percent)) return;
    const next = selectionRef.current.map((p, i) => i === index
      ? { ...p, [axis]: Math.min(size[axis === 'x' ? 'width' : 'height'],
          Math.max(0, percent * size[axis === 'x' ? 'width' : 'height'] / 100)) } : p);
    select(next);
  };

  const save = async (download = false) => {
    if (!ready || !canvasRef.current || saving || editing) return;
    setSaving(true);
    setError('');
    try {
      const blob = await new Promise(resolve => canvasRef.current.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
      if (!blob) throw new Error('Unable to save enhanced image');
      const name = (file.name || 'document').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_.-]/gi, '_').slice(0, 70) + '-enhanced.jpg';
      if (download) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        onApply(new File([blob], name, { type: 'image/jpeg' }));
      }
    } catch {
      setError('Could not save the enhanced picture. Try again.');
    } finally { setSaving(false); }
  };

  return <section className="document-enhancer" aria-label="Document photo enhancement">
    <div className="document-enhancer__heading">
      <div><h2><FiSliders /> Enhance and straighten document</h2>
        <p>Crop the page, fix camera perspective and improve clarity before OCR. Your original photo is preserved.</p></div>
      <button className="button" type="button" onClick={onClose} aria-label="Close photo enhancer"><FiX /> Close</button>
    </div>
    <div className="document-enhancer__framing">
      <button className="button" type="button" onClick={autoDetect} disabled={!ready || saving}>
        <FiRefreshCw /> Detect page automatically
      </button>
      <button className={'button ' + (editing ? 'button--primary' : '')} type="button"
        onClick={() => { setEditing(true); setError(''); setNotice('Drag the four circles onto the paper corners, then apply.'); }}
        disabled={!ready || saving}><FiMove /> Adjust corners</button>
      <button className="button" type="button" onClick={() => {
        setCropCorners(null); setEditing(false); setNotice('Full photo kept without cropping or perspective correction.');
      }} disabled={!ready || saving}>Keep full photo</button>
    </div>
    {notice && <p className="document-enhancer__notice" role="status">{notice}</p>}
    <div className="document-enhancer__presets" role="group" aria-label="Photo enhancement filter">
      {PHOTO_PRESETS.map(preset => <button key={preset} type="button"
        className={'button ' + (preset === mode ? 'button--primary' : '')}
        aria-pressed={preset === mode} onClick={() => setMode(preset)}>{labels[preset]}</button>)}
    </div>
    <label className="document-enhancer__strength" htmlFor="scan-strength">
      Enhancement strength: {strength}%
      <input id="scan-strength" type="range" min="0" max="100" step="5"
        value={strength} onChange={event => setStrength(Number(event.target.value))} />
    </label>
    {!ready && !error && <p role="status">Preparing your photo…</p>}
    <div className="document-enhancer__compare">
      <div>
        <strong>Before · {editing ? 'Move the corners' : 'Original photo'}</strong>
        {originalUrl && (editing && dimensions && selection
          ? <div className="document-enhancer__corner-stage">
              <img src={originalUrl} alt="Original document to select corners" draggable={false} />
              <svg viewBox={'0 0 ' + dimensions.width + ' ' + dimensions.height}
                preserveAspectRatio="none" aria-label="Document corner selector"
                onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>
                <polygon points={selection.map(p => p.x + ',' + p.y).join(' ')}
                  fill="rgba(28,122,236,.13)" stroke="#1875eb" strokeWidth={Math.max(3, dimensions.width / 300)} />
                {selection.map((p, i) => <g key={i}
                    onPointerDown={event => startDrag(event, i)}
                    role="button" tabIndex={0} aria-label={'Drag ' + names[i] + ' corner'}>
                    <circle cx={p.x} cy={p.y} r={Math.min(dimensions.width, dimensions.height) * .052}
                      fill="transparent" />
                    <circle cx={p.x} cy={p.y} r={Math.min(dimensions.width, dimensions.height) * .019}
                      fill="#1875eb" stroke="white" strokeWidth={Math.max(2, dimensions.width / 390)}
                      pointerEvents="none" />
                  </g>)}
              </svg>
            </div>
          : <img src={originalUrl} alt="Original document before enhancement" />)}
      </div>
      <div><strong>After · {cropCorners ? 'Perspective corrected' : 'Full photo'}</strong>
        <canvas ref={canvasRef} className="document-enhancer__canvas" aria-label="Straightened and enhanced document preview" /></div>
    </div>
    {editing && dimensions && selection && <div className="document-enhancer__corner-controls">
      <p>Move the blue handles to the four paper corners. You can also type positions below (as percentages).</p>
      <div className="document-enhancer__corner-fields">
        {selection.map((point, index) => <fieldset key={index}>
          <legend>{names[index]}</legend>
          {['x', 'y'].map(axis => <label key={axis}>
            {axis === 'x' ? 'X' : 'Y'} %
            <input type="number" min="0" max="100" step="1"
              aria-label={names[index] + ' ' + axis + ' percent'}
              value={Math.round(100 * point[axis] / dimensions[axis === 'x' ? 'width' : 'height'])}
              onChange={event => updateCorner(index, axis, Number(event.target.value))} />
          </label>)}
        </fieldset>)}
      </div>
      <div className="ocr-actions">
        <button className="button button--primary" type="button" onClick={applyCorners}><FiCheck /> Apply corners</button>
        <button className="button" type="button" onClick={() => {
          setEditing(false); select(cropCorners || insetDocumentCorners(dimensions.width, dimensions.height));
          setError(''); setNotice('Corner adjustments cancelled.');
        }}>Cancel adjustment</button>
      </div>
    </div>}
    <p className="document-enhancer__tip">A slightly tilted or trapezoid-shaped document can be fitted to a straight rectangular frame. Very dark, busy, folded or partly out-of-frame documents may need manual corner adjustment.</p>
    {error && <p role="alert" className="auth-status auth-status--error">{error}</p>}
    <div className="ocr-actions">
      <button className="button button--primary" type="button" disabled={!ready || saving || editing}
        onClick={() => save(false)}><FiCheck /> Use enhanced photo</button>
      <button className="button" type="button" disabled={!ready || saving || editing}
        onClick={() => save(true)}><FiDownload /> Download JPG</button>
    </div>
  </section>;
}
