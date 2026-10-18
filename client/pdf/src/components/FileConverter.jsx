import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiAlertCircle, FiArrowRight, FiCheck, FiCheckCircle, FiChevronRight,
  FiArrowDown, FiArrowUp, FiDownload, FiFile, FiInfo, FiPlus, FiTrash2, FiUploadCloud, FiZap,
} from "react-icons/fi";
import { getService, services } from "../data/services";
import ToolIcon from "./ToolIcon";
import ToolCard from "./ToolCard";
import { validateDownload } from "../utils/downloadFormat";
import "./Fileconverter.css";

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const formatBytes = (value) => value >= 1024 * 1024
  ? `${(value / (1024 * 1024)).toFixed(1)} MB`
  : `${Math.max(1, Math.ceil(value / 1024))} KB`;

export default function FileConverter({ service }) {
  const tool = getService(service);
  const [files, setFiles] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const multi = Boolean(tool.multiple);
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
    const next = multi ? [...files, ...list] : [list[0]];
    if (multi && next.length > tool.maxFiles) {
      setFeedback({ kind: "error", text: `You can select up to ${tool.maxFiles} files for this tool.` });
      return;
    }
    setFiles(next);
    setFeedback(null);
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

  const handleUpload = async (event) => {
    event.preventDefault();
    if (loading) return;
    if (files.length < (tool.minFiles || 1)) {
      setFeedback({ kind: "error", text: `Select at least ${tool.minFiles || 1} ${multi ? "files" : "file"} to continue.` });
      return;
    }

    const formData = new FormData();
    files.forEach((item) => formData.append(multi ? "files" : "file", item));

    setLoading(true);
    setFeedback({ kind: "info", text: "Your file is being processed. Please keep this tab open." });
    try {
      const response = await fetch(`${API_BASE_URL}/api/convert/${service}`, { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `Conversion failed (HTTP ${response.status}).`);
      }

      const blob = await response.blob();
      // Do not let an unexpected ZIP/JSON response masquerade as merged.pdf.
      const { filename } = await validateDownload(service, response, blob, files[0]?.name);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Leave the Blob URL alive while the browser hands large downloads to its
      // download manager; revoking it immediately can interrupt some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setFeedback({ kind: "success", text: `Done! Your ${filename} download should begin automatically.` });
      setFiles([]);
    } catch (error) {
      setFeedback({ kind: "error", text: error.message || "Something went wrong. Try again." });
      // Keep the selection for retry; a failed request shouldn't make people reselect files.
    } finally {
      setLoading(false);
    }
  };

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
                multiple={multi}
                onChange={onInputChange}
                onClick={(event) => event.stopPropagation()}
                tabIndex={-1}
                aria-label="File picker"
                disabled={loading}
              />
            </div>

            <div className="upload-requirements"><span><FiInfo aria-hidden="true" /> {tool.inputLabel}</span><span>50 MB max per file</span>{multi && <span>Up to {tool.maxFiles} files</span>}</div>

            {files.length > 0 && (
              <div className="file-selection">
                <div className="file-selection__heading"><strong>Selected files <span>{files.length}</span></strong>{multi && <button className="file-selection__add" type="button" onClick={() => fileInputRef.current?.click()} disabled={loading}><FiPlus /> Add more</button>}</div>
                <ul className="file-selection__list">
                  {files.map((item, index) => (
                    <li key={`${item.name}-${item.size}-${index}`}>
                      <span className="file-selection__icon"><FiFile aria-hidden="true" /></span>
                      <span className="file-selection__details"><strong title={item.name}>{item.name}</strong><small>{formatBytes(item.size)}</small></span>
                      {service === "pdf-merger" && <span className="file-selection__order">
                        <button type="button" className="file-selection__move" aria-label={`Move ${item.name} up`} title="Move up" disabled={loading || index === 0} onClick={() => moveFile(index, -1)}><FiArrowUp /></button>
                        <button type="button" className="file-selection__move" aria-label={`Move ${item.name} down`} title="Move down" disabled={loading || index === files.length - 1} onClick={() => moveFile(index, 1)}><FiArrowDown /></button>
                      </span>}
                      <button type="button" className="file-selection__remove" aria-label={`Remove ${item.name}`} title={`Remove ${item.name}`} disabled={loading} onClick={() => removeFile(index)}><FiTrash2 /></button>
                    </li>
                  ))}
                </ul>
                {service === "pdf-merger" && <p className="file-selection__hint">PDF pages will appear in this order. Use the arrows to rearrange files before merging.</p>}
              </div>
            )}

            {feedback && <div className={`upload-feedback upload-feedback--${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>
              {feedback.kind === "error" ? <FiAlertCircle aria-hidden="true" /> : feedback.kind === "success" ? <FiCheckCircle aria-hidden="true" /> : <FiInfo aria-hidden="true" />}
              <span>{feedback.text}</span>
            </div>}

            <button className="button button--primary convert-action" type="submit" disabled={loading || files.length < (tool.minFiles || 1)}>
              {loading ? <><span className="loading-spinner" /> Processing your files…</> : <><FiZap aria-hidden="true" /> {service === "pdf-merger" ? "Merge PDFs" : service === "zip-maker" ? "Create ZIP" : "Convert file"} <FiArrowRight className="convert-action__arrow" aria-hidden="true" /></>}
            </button>
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
          <div className="small-tip"><FiInfo aria-hidden="true" /><p><strong>Good to know</strong> You don't need an account to use file conversion tools.</p></div>
        </aside>
      </div>

      <section className="conversion-steps" aria-label="Conversion steps"><div><span><FiUploadCloud /></span><strong>1. Upload</strong><small>Choose your files</small></div><FiChevronRight className="conversion-steps__divider" /><div><span><FiZap /></span><strong>2. Convert</strong><small>We process them</small></div><FiChevronRight className="conversion-steps__divider" /><div><span><FiDownload /></span><strong>3. Download</strong><small>Save your result</small></div></section>

      <section className="related-section"><div className="section-heading"><div><span className="eyebrow">KEEP GOING</span><h2>Explore more tools</h2><p>Find another handy way to work with your files.</p></div><Link className="text-link" to="/">See all tools <FiArrowRight aria-hidden="true" /></Link></div><div className="tool-grid tool-grid--related">{relatedTools.map((item) => <ToolCard key={item.id} tool={item} compact />)}</div></section>
    </div>
  );
}
