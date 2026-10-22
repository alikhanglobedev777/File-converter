// Client-side CamScanner-style document presets. Processing is bounded by
// the existing 3 megapixel OCR limit. No images leave the browser.
export const PHOTO_PRESETS = ['original', 'document', 'grayscale', 'black-white'];
export function enhanceDocumentPixels(imageData, preset = 'document', intensity = 70) {
  if (!PHOTO_PRESETS.includes(preset)) throw new Error('Unknown enhancement mode');
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 100) {
    throw new Error('Invalid enhancement strength');
  }
  const { data, width, height } = imageData;
  if (!data || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 1 || height < 1 || width * height > 3_000_000 ||
      data.length !== width * height * 4) throw new Error('Invalid image data');
  if (preset === 'original') return imageData;
  // Derive robust low/high thresholds from sampled luminance instead of
  // assuming all cameras use identical exposure or document paper shades.
  const histogram = new Uint32Array(256);
  const count = width * height;
  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    histogram[Math.min(255, Math.max(0, luma))]++;
  }
  const cut = count * .015;
  let low = 0, high = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += histogram[i]; if (acc >= cut) { low = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += histogram[i]; if (acc >= cut) { high = i; break; } }
  const spread = Math.max(32, high - low);
  const factor = intensity / 100;
  const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
  // Threshold uses scene histogram, so users can photograph darker paper too.
  const midpoint = Math.max(90, Math.min(230, Math.round(low + spread * .59)));
  for (let i = 0; i < data.length; i += 4) {
    const red = data[i], green = data[i + 1], blue = data[i + 2];
    const gray = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const stretched = clamp((gray - low) * 255 / spread);
    if (preset === 'black-white') {
      const threshold = gray >= midpoint ? 255 : 0;
      // Keep a little tone at lower intensity rather than destroying text.
      const output = clamp(gray * (1 - factor) + threshold * factor);
      data[i] = output; data[i + 1] = output; data[i + 2] = output;
    } else if (preset === 'grayscale') {
      const output = clamp(gray * (1 - factor) + stretched * factor);
      data[i] = output; data[i + 1] = output; data[i + 2] = output;
    } else {
      // Retain colored stamps and highlighting while whitening paper and
      // increasing contrast. This is not perspective/edge correction.
      const mixed = clamp(gray * (1 - factor) + stretched * factor);
      const bright = clamp(mixed + 12 * factor);
      const chroma = .25 * factor;
      data[i] = clamp(bright + (red - gray) * chroma);
      data[i + 1] = clamp(bright + (green - gray) * chroma);
      data[i + 2] = clamp(bright + (blue - gray) * chroma);
    }
  }
  return imageData;
}
