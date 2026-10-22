import { useEffect, useRef, useState } from 'react';
import { FiCheck, FiDownload, FiSliders, FiX } from 'react-icons/fi';
import { decodeOcrPhoto, drawablePhoto } from '../utils/ocrPhoto';
import { boundedImageDimensions } from '../utils/ocrLimits';
import { enhanceDocumentPixels, PHOTO_PRESETS } from '../utils/documentEnhance';

const labels = { original: 'Original', document: 'Document', grayscale: 'Grayscale', 'black-white': 'Black & white' };
const JPEG_QUALITY = .92;

export default function DocumentPhotoEnhancer({ file, onApply, onClose }) {
  const canvasRef = useRef(null);
  const sourceRef = useRef(null);
  const generationRef = useRef(0);
  const [mode, setMode] = useState('document');
  const [strength, setStrength] = useState(70);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const run = ++generationRef.current;
    let decoded;
    (async () => {
      setError('');
      setReady(false);
      decoded = await decodeOcrPhoto(file);
      if (run !== generationRef.current) return;
      const size = boundedImageDimensions(decoded.width, decoded.height);
      const buffer = document.createElement('canvas');
      buffer.width = size.width;
      buffer.height = size.height;
      const context = buffer.getContext('2d', { willReadFrequently: true, alpha: false });
      if (!context) throw new Error('Canvas is unavailable');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, size.width, size.height);
      context.drawImage(drawablePhoto(decoded), 0, 0, size.width, size.height);
      sourceRef.current = context.getImageData(0, 0, size.width, size.height);
      if (run === generationRef.current) setReady(true);
    })().catch(() => {
      if (run === generationRef.current) setError('Could not open this picture for enhancement.');
    }).finally(() => decoded?.close?.());
    return () => { generationRef.current++; sourceRef.current = null; };
  }, [file]);

  useEffect(() => {
    if (!ready || !sourceRef.current || !canvasRef.current) return;
    const base = sourceRef.current;
    const canvas = canvasRef.current;
    canvas.width = base.width;
    canvas.height = base.height;
    const context = canvas.getContext('2d');
    if (!context) { setError('Preview is unavailable on this device.'); return; }
    const output = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
    enhanceDocumentPixels(output, mode, strength);
    context.putImageData(output, 0, 0);
  }, [mode, strength, ready]);

  const save = async (download = false) => {
    if (!ready || !canvasRef.current || saving) return;
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
    } finally {
      setSaving(false);
    }
  };

  return <section className="document-enhancer" aria-label="Document photo enhancement">
    <div className="document-enhancer__heading">
      <div><h2><FiSliders /> Enhance document photo</h2><p>Improve clarity and paper contrast before OCR. The original picture is not changed.</p></div>
      <button className="button" type="button" onClick={onClose} aria-label="Close photo enhancer"><FiX /> Close</button>
    </div>
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
    <canvas ref={canvasRef} className="document-enhancer__canvas" aria-label="Enhanced photo preview" />
    <p className="document-enhancer__tip">Tip: Place the document on a dark, flat surface and hold the camera steady. Presets improve text contrast, but don't automatically crop or straighten perspective yet.</p>
    {error && <p role="alert" className="auth-status auth-status--error">{error}</p>}
    <div className="ocr-actions">
      <button className="button button--primary" type="button" disabled={!ready || saving}
        onClick={() => save(false)}><FiCheck /> Use enhanced photo</button>
      <button className="button" type="button" disabled={!ready || saving}
        onClick={() => save(true)}><FiDownload /> Download JPG</button>
    </div>
  </section>;
}
