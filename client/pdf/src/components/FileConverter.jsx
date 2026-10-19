import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle, FiArrowRight, FiCheck, FiCheckCircle, FiChevronRight,
  FiArrowDown, FiArrowUp, FiDownload, FiFile, FiInfo, FiPlus, FiTrash2, FiUploadCloud, FiZap,
} from "react-icons/fi";
import { getService, services } from "../data/services";
import ToolIcon from "./ToolIcon";
import ToolCard from "./ToolCard";
import { validateDownload } from "../utils/downloadFormat";
import { requestConversion } from "../utils/conversionRequest";
import "./Fileconverter.css";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const BATCH_MAX_FILES = 5;
const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const formatBytes = (value) => value >= 1024 * 1024
  ? `${(value / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.ceil(value / 1024))} KB`;
const reorderableServices = new Set(["pdf-merger", "image-to-pdf"]);
const actionLabels = {
  "pdf-merger": "Merge PDFs",
  "zip-maker": "Create ZIP",
  "pdf-splitter": "Split PDF",
  "image-to-pdf": "Create PDF",
  "pdf-organizer": "Organize PDF",
  "pdf-compressor": "Compress PDF",
};

export default function FileConverter({ service }) {
  const tool = getService(service);
  const [files, setFiles] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [jpgPage, setJpgPage] = useState("1");
  const [splitPages, setSplitPages] = useState("1-2");
  const [organizerPages, setOrganizerPages] = useState("1");
  const [organizerRotate, setOrganizerRotate] = useState("");
  const [compressionLevel, setCompressionLevel] = useState('lossless');
  const [paperSize, setPaperSize] = useState('A4');
  const [orientation, setOrientation] = useState('auto');
  const [jpgQuality, setJpgQuality] = useState('90');
  const [jpgScale, setJpgScale] = useState('2');
  const [batchMode, setBatchMode] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const multi = Boolean(tool.multiple);
  const acceptsBatch = !multi;
  const pickingMultiple = multi || batchMode;

  useEffect(() => {
    const first = files[0];
    if (!first || (!first.type.startsWith('image/') && !/\.(pdf|png|jpe?g)$/i.test(first.name))) {
      return undefined;
    }
    const url = URL.createObjectURL(first);
    setPreviewUrl(url);
    return () => { URL.revokeObjectURL(url); setPreviewUrl(null); };
  }, [files]);

  const otherTools = services.filter((item) => item.id !== service && item.category === tool.category).slice(0, 3);
  const relatedTools = otherTools.length === 3 ? otherTools : [
    ...otherTools,
    ...services.filter((item) => item.id !== service && item.category !== tool.category).slice(0, 3 - otherTools.length),
  ];

  const chooseFiles = (selected) => {
    if (loading || !selected.length) return;
    const list = Array.from(selected);
    if (list.some((item) => item.size > MAX_FILE_BYTES)) {
      setFeedback({ kind: "error", text: "Each file must be 50 MB or smaller." });
      return;
    }
    const allowedExtensions = tool.input.split(",").filter(Boolean);
    if (allowedExtensions.length && list.some((item) => !allowedExtensions.some((ext) => item.name.toLowerCase().endsWith(ext)))) {
      setFeedback({ kind: "error", text: `Choose ${tool.inputLabel.toLowerCase()} (${allowedExtensions.join(", ")}).` });
      return;
    }
    const next = pickingMultiple ? [...files, ...list] : [list[0]];
    const limit = multi ? tool.maxFiles : batchMode ? BATCH_MAX_FILES : 1;
    if (next.length > limit) {
      setFeedback({ kind: "error", text: `You can select up to ${limit} files for this tool.` });
      return;
    }
    setFiles(next);
    if (service === "pdf-to-jpg") setJpgPage("1");
    if (service === "pdf-splitter") setSplitPages("1-2");
    if (service === "pdf-organizer") {
      setOrganizerPages("1");
      setOrganizerRotate("");
    }
    setFeedback(null);
    setResults([]);
  };

  const onInputChange = (event) => {
    chooseFiles(event.target.files || []);
    event.target.value = "";
  };

  const onDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    chooseFiles(event.dataTransfer.files || []);
  };

  const onKeyboardOpen = (event) => {
    if ((event.key === "Enter" || event.key === " ") && !loading) {
      event.preventDefault();
      fileInputRef.current?.click();
    }
  };

  const removeFile = (index) => {
    setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index));
    setFeedback(null);
  };

  const moveFile = (index, direction) => {
    setFiles((items) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= items.length) return items;
      const next = [...items];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
    setFeedback(null);
  };

  const addToolSpecificFields = (formData) => {
    if (service === "pdf-to-jpg") {
      formData.append('page', jpgPage);
      formData.append('quality', jpgQuality);
      formData.append('scale', jpgScale);
    }
    if (service === 'pdf-compressor') formData.append('level', compressionLevel);
    if (service === 'excel-to-pdf') {
      formData.append('paperSize', paperSize);
      formData.append('orientation', orientation);
    }
    if (service === "pdf-splitter") formData.append("pages", splitPages.trim());
    if (service === "pdf-organizer") {
      formData.append("pages", organizerPages.trim());
      if (organizerRotate.trim()) formData.append("rotate", organizerRotate.trim());
    }
  };

  const validateToolSpecificInput = () => {
    if (service === "pdf-to-jpg" && (!/^[1-9]\d*$/.test(jpgPage) || !Number.isSafeInteger(Number(jpgPage)))) {
      return "Enter a valid page number (1 or higher).";
    }
    if (service === "pdf-splitter" && !splitPages.trim()) return "Enter the pages you want to keep, for example 1-3,5.";
    if (service === "pdf-organizer" && !organizerPages.trim()) return "Enter the page order, for example 3,1,2,5.";
    return null;
  };

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Allow the download manager time to take ownership of large Blobs.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (files.length < (tool.minFiles || 1)) {
      setFeedback({ kind: 'error', text: `Select at least ${tool.minFiles || 1} ${multi ? 'files' : 'file'} to continue.` });
      return;
    }
    const validationError = validateToolSpecificInput();
    if (validationError) {
      setFeedback({ kind: 'error', text: validationError });
      return;
    }
    const batch = !multi && batchMode && files.length > 1;
    const jobs = batch ? files.map(file => [file]) : [files];
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setResults([]);
    setProgress({ stage: 'Preparing', percent: null, current: 1, total: jobs.length });
    setFeedback({ kind: 'info', text: batch ? 'Batch conversion started. Your browser may ask to allow multiple downloads.' : 'Your file is being processed. Please keep this tab open.' });
    const completed = [];
    for (let index = 0; index < jobs.length; index++) {
      if (controller.signal.aborted) break;
      const jobFiles = jobs[index];
      const formData = new FormData();
      jobFiles.forEach(item => formData.append(multi ? 'files' : 'file', item));
      addToolSpecificFields(formData);
      try {
        const { response, blob } = await requestConversion(`${API_BASE_URL}/api/convert/${service}`, formData, {
          signal: controller.signal,
          onProgress: update => setProgress({ ...update, current: index + 1, total: jobs.length }),
        });
        const { filename } = await validateDownload(service, response, blob, jobFiles[0]?.name);
        downloadFile(blob, filename);
        completed.push({ input: jobFiles[0]?.name, filename, bytes: blob.size, originalBytes: jobFiles.reduce((sum, f) => sum + f.size, 0), ok: true });
      } catch (error) {
        completed.push({ input: jobFiles[0]?.name, ok: false, error: error.message || 'Conversion failed.' });
        if (!batch || controller.signal.aborted) break;
      }
      setResults([...completed]);
    }
    setResults([...completed]);
    const success = completed.filter(entry => entry.ok).length;
    const failures = completed.length - success;
    const cancelled = controller.signal.aborted;
    if (cancelled) {
      setFeedback({ kind: 'info', text: `Stopped. ${success} of ${jobs.length} file(s) completed.` });
    } else if (failures) {
      setFeedback({ kind: 'error', text: `${success} succeeded; ${failures} failed. Review the results below. Your selection remains available for retry.` });
    } else if (service === 'pdf-to-jpg') {
      setFeedback({ kind: 'success', text: `Page ${jpgPage} saved. Change the page number and convert again for another JPG.` });
    } else {
      setFeedback({ kind: 'success', text: `Completed ${success} download${success === 1 ? '' : 's'}. Check your Downloads folder.` });
      setFiles([]);
    }
    abortRef.current = null;
    setProgress(null);
    setLoading(false);
  };

  const actionLabel = actionLabels[service] || "Convert file";

  return (
    <div className="page converter-page">
      <div className="page-heading">
        <div className="page-heading__trail"><Link to="/">All tools</Link><FiChevronRight aria-hidden="true" /><span>{tool.category}</span><FiChevronRight aria-hidden="true" /><strong>{tool.title}</strong></div>
        <div className="page-heading__row">
          <div className="page-heading__title-group"><span className="eyebrow">YOUR FILE WORKSPACE</span><h1>{tool.title}</h1><p>{tool.description}</p></div>
          <div className="page-heading__icon"><ToolIcon name={tool.icon} /></div>
        </div>
      </div>

      <div className="workspace-grid">
        <section className="upload-card" aria-label={`${tool.title} uploader`}>
          <div className="upload-card__header">
            <div><span className="upload-card__eyebrow">START HERE</span><h2>Upload your {multi ? "files" : "file"}</h2><p>{multi ? `Add ${tool.minFiles}–${tool.maxFiles} files to get started.` : `Choose a ${tool.inputLabel.toLowerCase()} to convert.`}</p></div>
            <span className="upload-card__step">STEP 01 / 02</span>
          </div>

          <form onSubmit={handleUpload}>
            <div
              className={`upload-zone ${isDragging ? "upload-zone--dragging" : ""} ${loading ? "upload-zone--disabled" : ""}`}
              onClick={() => !loading && fileInputRef.current?.click()}
              onKeyDown={onKeyboardOpen}
              onDragOver={(event) => { event.preventDefault(); if (!loading) setIsDragging(true); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false); }}
              onDrop={onDrop}
              role="button"
              tabIndex={loading ? -1 : 0}
              aria-disabled={loading}
              aria-label={`Choose ${tool.inputLabel.toLowerCase()} for ${tool.title}`}
            >
              <span className="upload-zone__icon"><FiUploadCloud aria-hidden="true" /></span>
              <strong>Drop your {multi ? "files" : "file"} here, or <span>browse</span></strong>
              <p>Drag & drop or click to choose from your device</p>
              <span className="upload-zone__select">Choose {multi ? "files" : "a file"} <FiPlus aria-hidden="true" /></span>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept={tool.input || undefined}
                multiple={pickingMultiple}
                onChange={onInputChange}
                onClick={(event) => event.stopPropagation()}
                tabIndex={-1}
                aria-label="File picker"
                disabled={loading}
              />
            </div>

            {acceptsBatch && (
              <label className="batch-toggle">
                <input type="checkbox" checked={batchMode} disabled={loading} onChange={event => { setBatchMode(event.target.checked); setFiles([]); setFeedback(null); setResults([]); }} />
                Convert up to {BATCH_MAX_FILES} files one at a time (batch mode)
              </label>
            )}

            <div className="upload-requirements"><span><FiInfo aria-hidden="true" /> {tool.inputLabel}</span><span>50 MB max per file</span>{multi && <span>Up to {tool.maxFiles} files</span>}</div>

            {service === "pdf-to-jpg" && (
              <div className="jpg-page-picker">
                <label htmlFor="jpg-page-number">Page number to export as JPG</label>
                <input
                  id="jpg-page-number"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={jpgPage}
                  onChange={(event) => { setJpgPage(event.target.value); setFeedback(null); }}
                  disabled={loading}
                  required
                />
                <div className="export-settings-row">
                  <label htmlFor="jpg-scale">Resolution<select id="jpg-scale" value={jpgScale} disabled={loading} onChange={e => setJpgScale(e.target.value)}><option value="1">Standard</option><option value="1.5">High</option><option value="2">Very high</option></select></label>
                  <label htmlFor="jpg-quality">JPEG quality<select id="jpg-quality" value={jpgQuality} disabled={loading} onChange={e => setJpgQuality(e.target.value)}><option value="65">Smaller</option><option value="80">Balanced</option><option value="90">Best</option></select></label>
                </div>
                <p>One JPG per conversion. Choose a page, resolution and image quality. Higher settings may increase file size.</p>
              </div>
            )}

            {service === 'pdf-compressor' && (
              <div className="jpg-page-picker">
                <label htmlFor="compression-level">Compression mode</label>
                <select id="compression-level" value={compressionLevel} disabled={loading} onChange={e => setCompressionLevel(e.target.value)}>
                  <option value="lossless">Lossless — retains selectable text</option>
                  <option value="balanced">Balanced — image pages, good quality</option>
                  <option value="strong">Strong — image pages, smaller file</option>
                </select>
                <p><strong>Important:</strong> Balanced/Strong flatten text and links into page images (25-page maximum). If compression cannot make the file smaller, the original PDF is returned.</p>
              </div>
            )}
            {service === 'excel-to-pdf' && (
              <div className="jpg-page-picker">
                <div className="export-settings-row">
                  <label htmlFor="paper-size">Paper size<select id="paper-size" value={paperSize} disabled={loading} onChange={e => setPaperSize(e.target.value)}><option value="A4">A4</option><option value="LETTER">US Letter</option></select></label>
                  <label htmlFor="orientation">Orientation<select id="orientation" value={orientation} disabled={loading} onChange={e => setOrientation(e.target.value)}><option value="auto">Automatic</option><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
                </div>
                <p>Choose paper size and layout for the generated spreadsheet PDF.</p>
              </div>
            )}

            {service === "pdf-splitter" && (
              <div className="jpg-page-picker">
                <label htmlFor="split-pages">Pages to keep</label>
                <input
                  id="split-pages"
                  type="text"
                  value={splitPages}
                  onChange={(event) => { setSplitPages(event.target.value); setFeedback(null); }}
                  placeholder="Examples: 1-3,5,8-10"
                  disabled={loading}
                  required
                />
                <p>Enter page numbers or ranges separated by commas. Example: <strong>1-3,5,8-10</strong>.</p>
              </div>
            )}

            {service === "pdf-organizer" && (
              <div className="jpg-page-picker jpg-page-picker--stacked">
                <label htmlFor="organizer-pages">Page order</label>
                <input
                  id="organizer-pages"
                  type="text"
                  value={organizerPages}
                  onChange={(event) => { setOrganizerPages(event.target.value); setFeedback(null); }}
                  placeholder="Example: 3,1,2,5"
                  disabled={loading}
                  required
                />
                <label htmlFor="organizer-rotate">Rotate pages (optional)</label>
                <input
                  id="organizer-rotate"
                  type="text"
                  value={organizerRotate}
                  onChange={(event) => { setOrganizerRotate(event.target.value); setFeedback(null); }}
                  placeholder="Example: 2:90,5:180"
                  disabled={loading}
                />
                <p>Use <strong>Page order</strong> to keep, delete, and reorder pages. Use <strong>Rotate pages</strong> for source pages you want turned 90°, 180°, or 270°.</p>
              </div>
            )}

            {files.length > 0 && (
              <div className="file-selection">
                <div className="file-selection__heading"><strong>Selected files <span>{files.length}</span></strong>{pickingMultiple && <button className="file-selection__add" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}><FiPlus /> Add more</button>}</div>
                <ul className="file-selection__list">
                  {files.map((item, index) => (
                    <li key={`${item.name}-${item.size}-${index}`}>
                      <span className="file-selection__icon"><FiFile aria-hidden="true" /></span>
                      <span className="file-selection__details"><strong title={item.name}>{item.name}</strong><small>{formatBytes(item.size)}</small></span>
                      {reorderableServices.has(service) && <span className="file-selection__order">
                        <button type="button" className="file-selection__move" aria-label={`Move ${item.name} up`} title="Move up" disabled={loading || index === 0} onClick={() => moveFile(index, -1)}><FiArrowUp /></button>
                        <button type="button" className="file-selection__move" aria-label={`Move ${item.name} down`} title="Move down" disabled={loading || index === files.length - 1} onClick={() => moveFile(index, 1)}><FiArrowDown /></button>
                      </span>}
                      <button type="button" className="file-selection__remove" aria-label={`Remove ${item.name}`} title={`Remove ${item.name}`} disabled={loading} onClick={() => removeFile(index)}><FiTrash2 /></button>
                    </li>
                  ))}
                </ul>
                {service === "pdf-merger" && <p className="file-selection__hint">PDF pages will appear in this order. Use the arrows to rearrange files before merging.</p>}
                {service === "image-to-pdf" && <p className="file-selection__hint">Each image becomes one PDF page in this order. Use the arrows to rearrange pages before creating the PDF.</p>}
              </div>
            )}

            {previewUrl && files.length > 0 && (
              <div className="preview-card">
                <div className="preview-card__heading"><strong>File preview</strong><small>{files[0].name} · {formatBytes(files[0].size)}</small></div>
                {/\.pdf$/i.test(files[0].name) ? (
                  <iframe title={`Preview ${files[0].name}`} src={`${previewUrl}#toolbar=0`} loading="lazy" />
                ) : <img src={previewUrl} alt={`Preview of ${files[0].name}`} />}
                {files.length > 1 && <p>Showing the first selected file. {files.length - 1} more in your list.</p>}
              </div>
            )}

            {feedback && <div className={`upload-feedback upload-feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
              {feedback.kind === "error" ? <FiAlertCircle aria-hidden="true" /> : feedback.kind === "success" ? <FiCheckCircle aria-hidden="true" /> : <FiInfo aria-hidden="true" />}
              <span>{feedback.text}</span>
            </div>}

            {progress && <div className="transfer-progress" role="status" aria-live="polite">
              <div><strong>{progress.stage} · {progress.current}/{progress.total}</strong><span>{progress.percent === null ? 'Processing…' : `${progress.percent}%`}</span></div>
              {progress.percent !== null && <progress max="100" value={progress.percent} aria-label={`${progress.stage} progress`} />}
              {progress.stage === 'Converting' && <p>The server does not provide a conversion percentage; this step can take longer for large files.</p>}
            </div>}
            {results.length > 0 && <div className="batch-results" aria-live="polite"><h3>Conversion results</h3><ul>{results.map((item, index) => <li key={`${index}-${item.input}`}><span>{item.ok ? <FiCheckCircle /> : <FiAlertCircle />}</span><span><strong>{item.input}</strong><small>{item.ok ? `${item.filename} · ${formatBytes(item.bytes)}${service === 'pdf-compressor' ? ` · Original ${formatBytes(item.originalBytes)}` : ''}` : item.error}</small></span></li>)}</ul></div>}

            {loading && <button className="button button--outline cancel-conversion" type="button" onClick={() => abortRef.current?.abort()}>Cancel conversion</button>}
            <button className="button button--primary convert-action" type="submit" disabled={loading || files.length < (tool.minFiles || 1)}>
              {loading ? <><span className="loading-spinner" /> Processing your files…</> : <><FiZap aria-hidden="true" /> {actionLabel} <FiArrowRight className="convert-action__arrow" aria-hidden="true" /></>}
            </button>
            {batchMode && <p className="upload-card__note">Batch conversions run sequentially. Some browsers require permission for multiple downloads.</p>}
            <p className="upload-card__note"><FiCheck aria-hidden="true" /> The download starts after processing is complete.</p>
          </form>
        </section>

        <aside className="workspace-side" aria-label="Conversion details">
          <div className="info-card info-card--blue">
            <span className="info-card__eyebrow">ABOUT THIS TOOL</span>
            <div className="info-card__icon"><ToolIcon name={tool.icon} /></div>
            <h2>From {tool.from} to {tool.to}.</h2>
            <p>{tool.detail}</p>
            <div className="info-card__format"><span>INPUT <strong>{tool.inputLabel}</strong></span><FiArrowRight aria-hidden="true" /><span>OUTPUT <strong>{tool.outputLabel}</strong></span></div>
          </div>
          <div className="info-card info-card--white">
            <h3>What to expect</h3>
            <ul className="expect-list">{tool.points.map((point) => <li key={point}><span><FiCheck aria-hidden="true" /></span>{point}</li>)}</ul>
          </div>
          <div className="info-card info-card--white">
            <h3>Reliability and limits</h3>
            <ul className="expect-list">
              <li><span><FiCheck aria-hidden="true" /></span>Uploads are limited to 50 MB per file.</li>
              <li><span><FiCheck aria-hidden="true" /></span>If the server is busy, retry after a short wait.</li>
              <li><span><FiCheck aria-hidden="true" /></span>Temporary files are removed after processing.</li>
            </ul>
          </div>
          <div className="small-tip"><FiInfo aria-hidden="true" /><p><strong>Good to know</strong> You don't need an account to use file conversion tools.</p></div>
        </aside>
      </div>

      <section className="conversion-steps" aria-label="Conversion steps"><div><span><FiUploadCloud /></span><strong>1. Upload</strong><small>Choose your files</small></div><FiChevronRight className="conversion-steps__divider" /><div><span><FiZap /></span><strong>2. Convert</strong><small>We process them</small></div><FiChevronRight className="conversion-steps__divider" /><div><span><FiDownload /></span><strong>3. Download</strong><small>Save your result</small></div></section>

      <section className="related-section"><div className="section-heading"><div><span className="eyebrow">KEEP GOING</span><h2>Explore more tools</h2><p>Find another handy way to work with your files.</p></div><Link className="text-link" to="/">See all tools <FiArrowRight aria-hidden="true" /></Link></div><div className="tool-grid tool-grid--related">{relatedTools.map((item) => <ToolCard key={item.id} tool={item} compact />)}</div></section>
    </div>
  );
}
