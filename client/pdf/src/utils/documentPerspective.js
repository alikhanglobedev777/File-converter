// All geometry runs locally in the browser with a strict pixel budget.
const MAX_PIXELS = 3_000_000;
const DETECT_SIDE = 220;
const pointDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const insetDocumentCorners = (width, height, inset = 0.06) => [
  { x: width * inset, y: height * inset },
  { x: width * (1 - inset), y: height * inset },
  { x: width * (1 - inset), y: height * (1 - inset) },
  { x: width * inset, y: height * (1 - inset) },
];

export function isValidDocumentCorners(corners, width, height) {
  if (!Array.isArray(corners) || corners.length !== 4 ||
      !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return false;
  if (!corners.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y) &&
      p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height)) return false;
  const edges = corners.map((p, i) => ({
    x: corners[(i + 1) % 4].x - p.x, y: corners[(i + 1) % 4].y - p.y,
  }));
  if (edges.some(e => Math.hypot(e.x, e.y) < Math.min(width, height) * 0.08)) return false;
  const crosses = edges.map((e, i) => e.x * edges[(i + 1) % 4].y - e.y * edges[(i + 1) % 4].x);
  if (crosses.some(c => c < width * height * 0.0015)) return false;
  const area = Math.abs(corners.reduce((sum, p, i) => {
    const next = corners[(i + 1) % 4];
    return sum + p.x * next.y - next.x * p.y;
  }, 0)) / 2;
  return area >= width * height * 0.045;
}

// Conservative high-contrast paper detector. If background colors vary too
// much or the page touches the frame, leave the image unchanged rather than
// automatically cutting off content. Manual correction remains available.
export function detectDocumentCorners(imageData) {
  const { data, width, height } = imageData || {};
  if (!data || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width < 32 || height < 32 || width * height > MAX_PIXELS ||
      data.length !== width * height * 4) return null;
  const scale = Math.min(1, DETECT_SIDE / Math.max(width, height));
  const w = Math.max(24, Math.round(width * scale));
  const h = Math.max(24, Math.round(height * scale));
  const samples = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(width - 1, Math.floor((x + .5) * width / w));
    const sy = Math.min(height - 1, Math.floor((y + .5) * height / h));
    const a = (sy * width + sx) * 4, b = (y * w + x) * 3;
    samples[b] = data[a]; samples[b + 1] = data[a + 1]; samples[b + 2] = data[a + 2];
  }
  const background = [];
  for (let i = 0; i <= 10; i++) {
    const x = Math.min(w - 1, Math.round((w - 1) * i / 10));
    for (const y of [1, h - 2]) background.push((y * w + x) * 3);
    const yy = Math.min(h - 1, Math.round((h - 1) * i / 10));
    for (const xx of [1, w - 2]) background.push((yy * w + xx) * 3);
  }
  const med = channel => {
    const values = background.map(p => samples[p + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  const bg = [med(0), med(1), med(2)];
  const bgLum = .213 * bg[0] + .715 * bg[1] + .072 * bg[2];
  const drift = background.reduce((sum, p) => sum +
    Math.abs(.213 * samples[p] + .715 * samples[p + 1] + .072 * samples[p + 2] - bgLum), 0) / background.length;
  if (drift > 32) return null;
  const mask = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) {
    const i = k * 3, r = samples[i] - bg[0], g = samples[i + 1] - bg[1], b = samples[i + 2] - bg[2];
    const lum = .213 * r + .715 * g + .072 * b;
    if (Math.abs(lum) > 39 || (r * r + g * g + b * b) > 95 * 95) mask[k] = 1;
  }
  const seen = new Uint8Array(w * h), queue = new Int32Array(w * h);
  let best = null;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let head = 0, tail = 1;
    queue[0] = start; seen[start] = 1;
    let tl = Infinity, tr = -Infinity, br = -Infinity, bl = Infinity;
    const vertices = [null, null, null, null];
    let touch = 0;
    while (head < tail) {
      const pos = queue[head++], x = pos % w, y = Math.floor(pos / w);
      if (x < 2 || x >= w - 2 || y < 2 || y >= h - 2) touch++;
      const sum = x + y, diff = x - y;
      if (sum < tl) { tl = sum; vertices[0] = { x, y }; }
      if (diff > tr) { tr = diff; vertices[1] = { x, y }; }
      if (sum > br) { br = sum; vertices[2] = { x, y }; }
      if (diff < bl) { bl = diff; vertices[3] = { x, y }; }
      if (x > 0) { const p = pos - 1; if (mask[p] && !seen[p]) { seen[p] = 1; queue[tail++] = p; } }
      if (x < w - 1) { const p = pos + 1; if (mask[p] && !seen[p]) { seen[p] = 1; queue[tail++] = p; } }
      if (y > 0) { const p = pos - w; if (mask[p] && !seen[p]) { seen[p] = 1; queue[tail++] = p; } }
      if (y < h - 1) { const p = pos + w; if (mask[p] && !seen[p]) { seen[p] = 1; queue[tail++] = p; } }
    }
    if (!best || tail > best.count) best = { count: tail, touch, vertices };
  }
  if (!best || best.count < w * h * .12 || best.count > w * h * .93 ||
      best.touch > Math.max(4, best.count * .035)) return null;
  const corners = best.vertices.map(p => ({
    x: Math.min(width, Math.max(0, (p.x + .5) * width / w)),
    y: Math.min(height, Math.max(0, (p.y + .5) * height / h)),
  }));
  return isValidDocumentCorners(corners, width, height) ? corners : null;
}

// Inverse projective mapping with bilinear pixel sampling. Straightens all
// four edges, not just rotating the image or resizing a trapezoid.
export function rectifyDocumentPixels(source, corners, maxPixels = MAX_PIXELS) {
  const { data, width, height } = source || {};
  if (!data || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      width * height > MAX_PIXELS || data.length !== width * height * 4 ||
      !isValidDocumentCorners(corners, width, height)) {
    throw new Error('Adjust the four document corners to form a valid page.');
  }
  if (!Number.isSafeInteger(maxPixels) || maxPixels < 10_000 || maxPixels > MAX_PIXELS) {
    throw new Error('Invalid output pixel limit');
  }
  const [tl, tr, br, bl] = corners;
  const targetW = Math.max(pointDistance(tl, tr), pointDistance(bl, br));
  const targetH = Math.max(pointDistance(tl, bl), pointDistance(tr, br));
  const scale = Math.min(1, Math.sqrt(maxPixels / (targetW * targetH)));
  const outW = Math.max(2, Math.round(targetW * scale));
  const outH = Math.max(2, Math.round(targetH * scale));
  const out = new Uint8ClampedArray(outW * outH * 4);
  const dx1 = tr.x - br.x, dx2 = bl.x - br.x, dx3 = tl.x - tr.x + br.x - bl.x;
  const dy1 = tr.y - br.y, dy2 = bl.y - br.y, dy3 = tl.y - tr.y + br.y - bl.y;
  const det = dx1 * dy2 - dx2 * dy1;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-7) {
    if (Math.abs(det) < 1e-8 * width * height) throw new Error('Cannot straighten these document corners');
    g = (dx3 * dy2 - dx2 * dy3) / det;
    h = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = tr.x - tl.x + g * tr.x, b = bl.x - tl.x + h * bl.x, c = tl.x;
  const d = tr.y - tl.y + g * tr.y, e = bl.y - tl.y + h * bl.y, f = tl.y;
  for (let y = 0; y < outH; y++) {
    const v = y / (outH - 1);
    for (let x = 0; x < outW; x++) {
      const u = x / (outW - 1), denom = g * u + h * v + 1;
      if (Math.abs(denom) < 1e-8) continue;
      const sx = Math.min(width - 1, Math.max(0, (a * u + b * v + c) / denom));
      const sy = Math.min(height - 1, Math.max(0, (d * u + e * v + f) / denom));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const i00 = (y0 * width + x0) * 4, i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4, i11 = (y1 * width + x1) * 4;
      const dest = (y * outW + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        out[dest + ch] = Math.round(
          data[i00 + ch] * (1 - fx) * (1 - fy) + data[i10 + ch] * fx * (1 - fy) +
          data[i01 + ch] * (1 - fx) * fy + data[i11 + ch] * fx * fy);
      }
      out[dest + 3] = 255;
    }
  }
  return { width: outW, height: outH, data: out };
}
