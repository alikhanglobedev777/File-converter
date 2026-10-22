// Decode locally with a fallback for browsers that do not expose createImageBitmap.
export async function decodeOcrPhoto(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Could not read the photo'));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight,
      close: () => { image.src = ''; } };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ImageBitmap can be passed directly to drawImage; fallback returns HTMLImageElement.
export function drawablePhoto(decoded) {
  return decoded?.image || decoded;
}
