const { cropPage } = require('./pdf-layout');

function withinBounds(rect, layout) {
  return Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) && Number.isFinite(rect.height) &&
    rect.width >= 3 && rect.height >= 3 &&
    rect.x >= 0 && rect.y >= 0 &&
    rect.x + rect.width <= layout.width + 0.5 &&
    rect.y + rect.height <= layout.height + 0.5;
}

function makeColorImage(document, fill, stroke, thickness = 1) {
  const surface = document.canvasFactory.create(20, 20);
  try {
    surface.context.clearRect(0, 0, 20, 20);
    if (fill) {
      surface.context.fillStyle = '#' + fill;
      surface.context.fillRect(0, 0, 20, 20);
    }
    if (stroke) {
      surface.context.strokeStyle = '#' + stroke;
      surface.context.lineWidth = Math.max(1, Math.min(4, thickness));
      surface.context.strokeRect(1, 1, 18, 18);
    }
    return surface.canvas.toBuffer('image/png');
  } finally { document.canvasFactory.destroy(surface); }
}

// Only drawing regions are rasterized, never an entire selectable-text page.
// Word receives individual background pieces and native TextRuns remain editable.
function collectArtwork(document, rendered, layout) {
  const { rectangles = [], lines = [], images = [] } = layout.graphics || {};
  const artwork = [], pageArea = layout.width * layout.height;
  // Do not float large opaque PDF rectangles over editable Word text. They
  // may be page backgrounds, decorative resume panels, or clipping shapes;
  // drawing them as PNGs can create the giant solid blocks seen in Word.
  // Only very thin decorative rules are safe to place as image objects.
  for (const rect of rectangles.slice(0, 180)) {
    if (!withinBounds(rect, layout)) continue;
    if (!rect.fill && !rect.stroke) continue;
    if (rect.width > 4 && rect.height > 4) continue;
    artwork.push({ ...rect, kind: 'rule',
      data: makeColorImage(document, rect.fill, rect.stroke, rect.lineWidth) });
  }
  for (const line of lines.slice(0, 160)) {
    const horizontal = Math.abs(line.y1 - line.y2) <= 1;
    const vertical = Math.abs(line.x1 - line.x2) <= 1;
    if (!horizontal && !vertical) continue;
    const width = horizontal ? Math.abs(line.x2 - line.x1) : Math.max(1, line.lineWidth);
    const height = vertical ? Math.abs(line.y2 - line.y1) : Math.max(1, line.lineWidth);
    const rect = {
      x: Math.min(line.x1, line.x2), y: Math.min(line.y1, line.y2),
      width, height,
    };
    if (!withinBounds({...rect, width:Math.max(3,rect.width),height:Math.max(3,rect.height)},layout)) continue;
    artwork.push({ ...rect, kind: 'line', data: makeColorImage(document, line.color, null) });
  }
  for (const image of images.slice(0, 64)) {
    if (!withinBounds(image, layout)) continue;
    // A huge image containing its own visible text would duplicate the same
    // words underneath the editable runs. Leave full-page scans to OCR fallback.
    if (layout.items.length && image.width * image.height > pageArea * 0.7) continue;
    // Some PDFs flatten a large background panel with text into an image.
    // Avoid floating that over actual selectable text.
    const coveredText = layout.items.filter(item =>
      item.x >= image.x && item.x < image.x + image.width &&
      item.y >= image.y && item.y < image.y + image.height);
    if (coveredText.length >= 3 && image.width * image.height > pageArea * 0.05) continue;
    artwork.push({ ...image, kind: 'image', data: cropPage(document, rendered,
      image.x, image.y, image.width, image.height) });
  }
  return artwork;
}

module.exports = { collectArtwork };
