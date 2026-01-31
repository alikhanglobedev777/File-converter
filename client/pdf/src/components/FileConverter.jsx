import React, { useState, useRef } from "react";
import axios from "axios";
import "./FileConverter.css";

const FileConverter = ({ service }) => {
  const [file, setFile] = useState(null);
  const [files, setFiles] = useState([]); // For multiple files (PDF merger, ZIP)
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Handle single or multiple file selection
  const handleFileChange = (e) => {
    if (!e.target.files) return;

    if (service === "pdf-merger" || service === "zip-maker") {
      setFiles(Array.from(e.target.files));
    } else {
      setFile(e.target.files[0]);
    }
    setMessage("");
    e.target.value = null; // allow re-selecting same file
  };

  // Drag & Drop
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles) return;

    if (service === "pdf-merger" || service === "zip-maker") {
      setFiles(Array.from(droppedFiles));
    } else {
      setFile(droppedFiles[0]);
    }
    setMessage("");
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // Keyboard accessibility
  const handleKeyPress = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fileInputRef.current?.click();
    }
  };

  // Upload & convert
  const handleUpload = async () => {
    if (!file && files.length === 0) {
      setMessage("Please select file(s) to upload");
      return;
    }

    const formData = new FormData();
    if (service === "pdf-merger" || service === "zip-maker") {
      files.forEach((f) => formData.append("files", f));
    } else {
      formData.append("file", file);
    }

    try {
      setLoading(true);
      setMessage("Uploading and converting...");

      const res = await axios.post(
        `http://localhost:5000/api/convert/${service}`,
        formData,
        { responseType: "blob" } // important for binary files
      );

      // Determine proper filename
      let filename = "";
      const disposition = res.headers["content-disposition"];
      if (disposition && disposition.includes("filename=")) {
        filename = disposition.split("filename=")[1].replace(/"/g, "").trim();
      } else {
        // fallback: assign proper extension based on service
        let ext = "file";
        switch (service) {
          case "excel-to-pdf": ext = "pdf"; break;
          case "excel-to-ppt": ext = "pptx"; break;
          case "excel-to-word": ext = "docx"; break;
          case "pdf-to-word": ext = "docx"; break;
          case "pdf-to-excel": ext = "xlsx"; break;
          case "pdf-to-ppt": ext = "pptx"; break;
          case "pdf-to-jpg": ext = "jpg"; break;
          case "pdf-merger":
          case "zip-maker": ext = "zip"; break;
          default: ext = "file";
        }
        filename = file
          ? file.name.replace(/\.[^/.]+$/, `.${ext}`)
          : `converted.${ext}`;
      }

      // Download the converted file
      const blob = new Blob([res.data], { type: res.data.type });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      setMessage("Conversion successful ✅");
    } catch (err) {
      console.error(err);
      setMessage("Conversion failed ❌");
    } finally {
      setLoading(false);
      setFile(null);
      setFiles([]);
    }
  };

  return (
    <div className="container">
      <h2>{service.replace(/-/g, " ").toUpperCase()}</h2>

      <div
        className="upload-area"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={handleKeyPress}
        role="button"
        tabIndex={0}
        aria-label="File upload area"
      >
        {file || files.length > 0 ? (
          <div className="selected-files">
            {file && (
              <p>
                Selected: <strong>{file.name}</strong>
              </p>
            )}
            {files.length > 0 && (
              <p>
                Selected files:{" "}
                <strong>{files.map((f) => f.name).join(", ")}</strong>
              </p>
            )}
          </div>
        ) : (
          <p className="upload-text">
            {service === "pdf-merger" || service === "zip-maker"
              ? "Drag & drop multiple files here or click to select"
              : "Drag & drop your file here or click to select"}
          </p>
        )}

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple={service === "pdf-merger" || service === "zip-maker"}
          style={{ display: "none" }}
        />
      </div>

      <button onClick={handleUpload} disabled={loading} className="convert-btn">
        {loading ? "Processing..." : "Convert"}
      </button>

      {message && (
        <p
          className={`message ${
            message.includes("failed") ? "error" : "success"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
};

export default FileConverter;
