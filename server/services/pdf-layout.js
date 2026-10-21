const fs = require('node:fs/promises');
const path = require('node:path');

async function openPdf(filename) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const assets = path.dirname(require.resolve('pdfjs-dist/package.json')).replace(/\\/g, '/');
  return pdfjs.getDocument({
    data: new Uint8Array(await fs.readFile(filename)),
    standardFontDataUrl: `${assets}/standard_fonts/`,
    cMapUrl: `${assets}/cmaps/`, cMapPacked: true, isEvalSupported: false,
  }).promise;
}

async function renderPage(document, page, scale = 1.5) {
  const size = page.getViewport({ scale: 1 });
  scale = Math.min(scale, Math.sqrt(12000000 / (size.width * size.height)));
  const viewport = page.getViewport({ scale });
  const surface = document.canvasFactory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
  try {
    await page.render({ canvasContext: surface.context, viewport }).promise;
    return { ...surface, scale, width: size.width, height: size.height };
  } catch (error) {
    document.canvasFactory.destroy(surface);
    throw error;
  }
}

function cropPage(document, rendered, x, y, width, height) {
  const scale = rendered.scale;
  const crop = document.canvasFactory.create(Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)));
  try {
    crop.context.drawImage(rendered.canvas, x * scale, y * scale, width * scale, height * scale, 0, 0, crop.canvas.width, crop.canvas.height);
    return crop.canvas.toBuffer('image/png');
  } finally { document.canvasFactory.destroy(crop); }
}

function groupLines(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let row = rows.find(row => Math.abs(row.y - item.y) < Math.max(2, item.size * 0.25));
    if (!row) rows.push(row = { y: item.y, items: [] });
    row.items.push(item);
  }
  return rows.map(row => ({ ...row, items: row.items.sort((a, b) => a.x - b.x) }));
}

function joinItems(items) {
  return groupLines(items).map(row => row.items.reduce((text, item, index) => {
    const previous = row.items[index - 1];
    const space = previous && item.x - previous.x - previous.width > item.size * 0.15 ? ' ' : '';
    return text + space + item.text;
  }, '')).join('\n');
}

// Keep PDF text fragments in source coordinates. Group only adjacent runs with
// identical styling, so columns and differently styled headings do not collapse.
function positionedLines(items) {
  return groupLines(items).map(line => {
    const segments = [];
    for (const item of line.items) {
      const previous = segments.at(-1);
      const gap = previous && item.x - (previous.x + previous.width);
      if (previous && gap >= -0.5 && gap < Math.max(1.5, item.size * 0.3) &&
          previous.font === item.font && previous.bold === item.bold &&
          previous.italic === item.italic && previous.color === item.color &&
          Math.abs(previous.size - item.size) < 0.5) {
        previous.text += (gap > item.size * 0.15 ? ' ' : '') + item.text;
        previous.width = Math.max(previous.width, item.x + item.width - previous.x);
      } else segments.push({ ...item });
    }
    return { y: Math.max(0, Math.min(...line.items.map(item => item.y))),
      height: Math.max(...line.items.map(item => item.size)) * 1.35, segments };
  });
}

// Decorative boxes aren't a table. A table has at least two rows and
// repeatable, aligned column positions, not merely four rectangles.
function isTableLayout(layout) {
  if (layout.cells.length < 4) return false;
  const rows = [];
  for (const cell of [...layout.cells].sort((a, b) => a.y - b.y)) {
    let row = rows.find(r => Math.abs(r.y - cell.y) <= 1);
    if (!row) rows.push(row = { y: cell.y, cells: [] });
    row.cells.push(cell);
  }
  const populated = rows.filter(row => row.cells.length >= 2);
  if (populated.length < 2) return false;
  return populated.some((row, i) => populated.slice(i + 1).some(other =>
    row.cells.filter(a => other.cells.some(b =>
      Math.abs(a.x - b.x) <= 1 && Math.abs(a.width - b.width) <= 1)).length >= 2));
}

// Only recognize axis-aligned rectangles, never arbitrary drawings as cells.
async function extractLayout(page) {
  const { OPS, Util } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const viewport = page.getViewport({ scale: 1 });
  const operators = await page.getOperatorList();
  const content = await page.getTextContent();
  const rectangles = [], colors = new Map(), stack = [];
  let state = { matrix: [1, 0, 0, 1, 0, 0], fill: '000000', stroke: '000000', lineWidth: 1, font: '' };
  const hex = value => typeof value === 'string' ? value.replace('#', '').toUpperCase() : '000000';
  for (let i = 0; i < operators.fnArray.length; i++) {
    const op = operators.fnArray[i], args = operators.argsArray[i];
    if (op === OPS.save) stack.push({ ...state, matrix: [...state.matrix] });
    else if (op === OPS.restore) state = stack.pop() || state;
    else if (op === OPS.transform) state.matrix = Util.transform(state.matrix, args);
    else if (op === OPS.setFillRGBColor) state.fill = hex(args[0]);
    else if (op === OPS.setStrokeRGBColor) state.stroke = hex(args[0]);
    else if (op === OPS.setLineWidth) state.lineWidth = args[0];
    else if (op === OPS.setFont) state.font = args[0];
    else if (op === OPS.showText) {
      const text = args[0].filter(glyph => typeof glyph === 'object').map(glyph => glyph.unicode).join('').trim();
      const key = `${state.font}:${text}`;
      if (!colors.has(key)) colors.set(key, []);
      colors.get(key).push(state.fill);
    } else if (op === OPS.constructPath) {
      const [paint, paths] = args;
      for (const data of paths || []) {
        if (data.length !== 13 || data[0] !== 0 || data[3] !== 1 || data[6] !== 1 || data[9] !== 1 || data[12] !== 4) continue;
        const matrix = Util.transform(viewport.transform, state.matrix);
        const corners = [1, 4, 7, 10].map(j => {
          const point = [data[j], data[j + 1]];
          Util.applyTransform(point, matrix);
          return point;
        });
        const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
        const x = Math.min(...xs), y = Math.min(...ys);
        const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
        if (width < 8 || height < 8 || !corners.every(p => (Math.abs(p[0] - x) < 0.5 || Math.abs(p[0] - x - width) < 0.5) && (Math.abs(p[1] - y) < 0.5 || Math.abs(p[1] - y - height) < 0.5))) continue;
        const fill = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke].includes(paint);
        const stroke = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke].includes(paint);
        if (fill || stroke) rectangles.push({ x, y, width, height, fill: fill ? state.fill : null, stroke: stroke ? state.stroke : null, lineWidth: state.lineWidth });
      }
    }
  }
  const items = content.items.filter(item => item.str?.trim()).map(item => {
    const matrix = Util.transform(viewport.transform, item.transform);
    let font;
    try { font = page.commonObjs.get(item.fontName); } catch { /* font fallback */ }
    const size = Math.hypot(matrix[2], matrix[3]) || item.height || 10;
    const name = font?.name || content.styles[item.fontName]?.fontFamily || 'Arial';
    return {
      text: item.str.trim(), x: matrix[4], y: matrix[5] - size * 0.8, width: item.width, size,
      font: /times|serif/i.test(name) && !/sans/i.test(name) ? 'Times New Roman' : /courier|mono/i.test(name) ? 'Courier New' : 'Arial',
      bold: !!font?.bold || /bold/i.test(name), italic: !!font?.italic || /italic|oblique/i.test(name),
      color: colors.get(`${item.fontName}:${item.str.trim()}`)?.shift() || '000000',
    };
  });
  const cells = rectangles.filter(rect => rectangles.some(other => other !== rect && Math.abs(other.y - rect.y) < 1 && Math.abs(other.height - rect.height) < 1));
  return { width: viewport.width, height: viewport.height, items, cells };
}

module.exports = { openPdf, renderPage, cropPage, extractLayout, groupLines, joinItems, positionedLines, isTableLayout };
