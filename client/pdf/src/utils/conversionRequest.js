// XMLHttpRequest exposes real upload and download byte progress where supported.
// Never display an invented conversion percentage: the server doesn't report one.
export function requestConversion(url, formData, { signal, onProgress = () => {}, xhrFactory = () => new XMLHttpRequest() } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = xhrFactory();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => xhr.abort();
    if (signal?.aborted) return finish(new Error('Conversion cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    xhr.open('POST', url);
    xhr.responseType = 'blob';
    xhr.timeout = 180_000;
    xhr.upload.onprogress = event => onProgress({ stage: 'Uploading', percent: event.lengthComputable && event.total ? Math.round(event.loaded * 100 / event.total) : null });
    xhr.upload.onload = () => onProgress({ stage: 'Converting', percent: null });
    xhr.onprogress = event => onProgress({ stage: 'Downloading', percent: event.lengthComputable && event.total ? Math.round(event.loaded * 100 / event.total) : null });
    xhr.onabort = () => finish(new Error('Conversion cancelled.'));
    xhr.onerror = () => finish(new Error('Network error. Check your connection or wait for the server to wake up, then retry.'));
    xhr.ontimeout = () => finish(new Error('The request timed out. Try a smaller file.'));
    xhr.onload = async () => {
      const blob = xhr.response;
      const response = { status: xhr.status, ok: xhr.status >= 200 && xhr.status < 300, headers: { get: name => xhr.getResponseHeader(name) } };
      if (!response.ok) {
        let details = {};
        try { details = JSON.parse(await blob.text()); } catch { /* safe fallback */ }
        const specific = { 429: 'Too many conversion requests. Wait a few minutes and retry.', 503: 'The converter is busy or waking up. Retry shortly.', 504: 'This conversion took too long. Try a smaller file.', 413: 'Upload too large for the server.' };
        const error = new Error(details.error || specific[xhr.status] || `Conversion failed (HTTP ${xhr.status}).`);
        error.status = xhr.status;
        return finish(error);
      }
      finish(null, { response, blob });
    };
    xhr.send(formData);
  });
}
