// Validate actual downloaded bytes before giving them a file extension. A .pdf
// filename on a ZIP or JSON response produces corrupt downloads on Windows.
const formats = {
  "pdf-to-excel": ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  "pdf-to-word": ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  "ocr-to-word": ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  "ocr-searchable-pdf": ["pdf", "application/pdf"],
  "pdf-to-jpg": ["jpg", "image/jpeg"],
  "pdf-to-png": ["png", "image/png"],
  "pdf-to-ppt": ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  "excel-to-pdf": ["pdf", "application/pdf"],
  "excel-to-word": ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  "excel-to-ppt": ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  "pdf-compressor": ["pdf", "application/pdf"],
  "pdf-splitter": ["pdf", "application/pdf"],
  "image-to-pdf": ["pdf", "application/pdf"],
  "pdf-organizer": ["pdf", "application/pdf"],
  "pdf-merger": ["pdf", "application/pdf"],
  "zip-maker": ["zip", "application/zip"],
};
const zipFormats = new Set(["zip", "xlsx", "docx", "pptx"]);

function headerFilename(disposition) {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i);
  if (encoded) {
    try { return decodeURIComponent(encoded[1]); } catch { /* use plain filename */ }
  }
  const plain = disposition?.match(/filename="([^"]+)"|filename=([^;]+)/i);
  return (plain?.[1] || plain?.[2] || "").trim();
}

function isZip(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
    ((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6));
}

async function completeZip(blob) {
  const tail = new Uint8Array(await blob.slice(Math.max(0, blob.size - 65557)).arrayBuffer());
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) {
      const commentSize = tail[i + 20] | (tail[i + 21] << 8);
      if (i + 22 + commentSize === tail.length) return true;
    }
  }
  return false;
}

export async function validateDownload(service, response, blob, originalFilename) {
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const signature = bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d
    ? "pdf"
    : [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>bytes[index]===byte) ? "png"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpg"
      : isZip(bytes) ? "zip" : "unknown";
  const [extension, mime] = formats[service] || [];
  const expectedSignature = zipFormats.has(extension) ? "zip" : extension;
  if (!extension || signature !== expectedSignature) {
    const actual = signature === "unknown" ? "unknown data" : `${signature.toUpperCase()} data`;
    throw new Error(`Incorrect download format: ${service} returned ${actual}, not ${extension?.toUpperCase() || "a supported file"}. Check that your backend is running the updated conversion route.`);
  }
  if (extension === 'png') {
    const end = new Uint8Array(await blob.slice(-12).arrayBuffer());
    const marker = [0,0,0,0,73,69,78,68,174,66,96,130];
    if (blob.size < 20 || !marker.every((byte, index) => end[index] === byte)) {
      throw new Error("The server returned an incomplete PNG. No damaged file was downloaded.");
    }
  }
  if (extension === 'jpg') {
    const end = new Uint8Array(await blob.slice(-2).arrayBuffer());
    if (end[0] !== 0xff || end[1] !== 0xd9) {
      throw new Error("The server returned an incomplete JPG. No damaged file was downloaded.");
    }
  }
  if (zipFormats.has(extension) && !(await completeZip(blob))) {
    throw new Error("The server returned an incomplete ZIP-based file. No damaged file was downloaded.");
  }
  const responseType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (responseType && responseType !== mime && responseType !== "application/octet-stream") {
    throw new Error(`The server sent an incorrect Content-Type (${responseType}) for a .${extension} download.`);
  }
  const serverName = headerFilename(response.headers.get("content-disposition"))
    .split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "");
  if (serverName && !serverName.toLowerCase().endsWith(`.${extension}`)) {
    throw new Error(`The server gave the file an incorrect extension: ${serverName}. No damaged file was downloaded.`);
  }
  const base = service === "pdf-compressor" ? "compressed"
    : service === "pdf-merger" ? "merged"
    : service === "zip-maker" ? "archive"
      : service === "pdf-splitter" ? "split"
        : service === "image-to-pdf" ? "images"
          : service === "pdf-organizer" ? "organized"
            : (originalFilename || "converted").replace(/\.[^.]+$/, "");
  const safeBase = base.split(/[\\/]/).pop() || "converted";
  return { filename: serverName || `${safeBase}.${extension}`, extension, mime };
}
