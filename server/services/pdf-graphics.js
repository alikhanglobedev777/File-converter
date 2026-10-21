// Interpret PDF.js drawing operators in *page* coordinates. PDF.js exposes
// constructPath as [pathOperators, flatCoordinates, bounds], NOT an array of
// painted rectangles; the painting operation follows it in the operator list.
function extractGraphics(operatorList, OPS, Util, viewport) {
  const rectangles = [], lines = [], images = [];
  const stack = [];
  let state = { matrix: [1, 0, 0, 1, 0, 0], fill: '000000', stroke: '000000', lineWidth: 1 };
  let pendingRects = [], pendingLines = [];

  const color = (args, fallback) => {
    const first = args && args[0];
    if (typeof first === 'string' && /^[#]?[0-9a-f]{6}$/i.test(first)) {
      return first.replace('#', '').toUpperCase();
    }
    const components = Array.isArray(first) || ArrayBuffer.isView(first) ?
      first : args;
    if (!components || components.length < 3 || ![0, 1, 2].every(i => typeof components[i] === 'number')) return fallback;
    return [...components].slice(0, 3).map(v =>
      Math.max(0, Math.min(255, Math.round(v <= 1 ? v * 255 : v)))
        .toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const transform = (point) => Util.applyTransform(point,
    Util.transform(viewport.transform, state.matrix));
  const bounded = (points) => {
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const x = Math.max(0, Math.min(...xs)), y = Math.max(0, Math.min(...ys));
    const right = Math.min(viewport.width, Math.max(...xs));
    const bottom = Math.min(viewport.height, Math.max(...ys));
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  };
  const pushRect = (x, y, w, h) => {
    const region = bounded([
      transform([x, y]), transform([x + w, y]),
      transform([x, y + h]), transform([x + w, y + h]),
    ]);
    if (region.width >= 1 && region.height >= 1) pendingRects.push(region);
  };
  const pushLine = (from, to) => {
    if (!from || !to) return;
    const a = transform(from), b = transform(to);
    if (Math.abs(a[0] - b[0]) < 1 || Math.abs(a[1] - b[1]) < 1) {
      pendingLines.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] });
    }
  };
  const paint = (op) => {
    const filling = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke].includes(op);
    const stroking = [OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke].includes(op);
    for (const rect of pendingRects) rectangles.push({
      ...rect,
      fill: filling ? state.fill : null,
      stroke: stroking ? state.stroke : null,
      lineWidth: state.lineWidth,
    });
    if (stroking) for (const line of pendingLines) lines.push({
      ...line, color: state.stroke, lineWidth: state.lineWidth,
    });
    pendingRects = []; pendingLines = [];
  };

  for (let i = 0; i < operatorList.fnArray.length; i++) {
    const op = operatorList.fnArray[i], args = operatorList.argsArray[i] || [];
    if (op === OPS.save) {
      stack.push({ ...state, matrix: [...state.matrix] });
    } else if (op === OPS.restore) {
      state = stack.pop() || state;
    } else if (op === OPS.transform) {
      state.matrix = Util.transform(state.matrix, args);
    } else if (op === OPS.setFillRGBColor) {
      state.fill = color(args, state.fill);
    } else if (op === OPS.setStrokeRGBColor) {
      state.stroke = color(args, state.stroke);
    } else if (op === OPS.setLineWidth) {
      state.lineWidth = Number(args[0]) || 1;
    } else if (op === OPS.constructPath) {
      const commands = args[0] || [], coords = args[1] || [];
      let offset = 0, cursor, start;
      for (const command of commands) {
        if (command === OPS.rectangle) {
          pushRect(coords[offset], coords[offset + 1], coords[offset + 2], coords[offset + 3]);
          offset += 4;
        } else if (command === OPS.moveTo) {
          cursor = [coords[offset], coords[offset + 1]]; start = cursor; offset += 2;
        } else if (command === OPS.lineTo) {
          const next = [coords[offset], coords[offset + 1]];
          pushLine(cursor, next); cursor = next; offset += 2;
        } else if (command === OPS.curveTo) {
          cursor = [coords[offset + 4], coords[offset + 5]]; offset += 6;
        } else if (command === OPS.curveTo2 || command === OPS.curveTo3) {
          cursor = [coords[offset + 2], coords[offset + 3]]; offset += 4;
        } else if (command === OPS.closePath) {
          pushLine(cursor, start); cursor = start;
        }
      }
    } else if ([OPS.fill, OPS.eoFill, OPS.stroke, OPS.closeStroke, OPS.fillStroke,
      OPS.eoFillStroke].includes(op)) {
      paint(op);
    } else if ([OPS.paintImageXObject, OPS.paintJpegXObject,
      OPS.paintInlineImageXObject, OPS.paintImageMaskXObject].includes(op)) {
      const rect = bounded([
        transform([0, 0]), transform([1, 0]),
        transform([0, 1]), transform([1, 1]),
      ]);
      if (rect.width >= 5 && rect.height >= 5 &&
          rect.width * rect.height <= viewport.width * viewport.height * 1.01) {
        images.push(rect);
      }
    }
  }
  const dedupe = (arr) => arr.filter((rect, index) => arr.findIndex(other =>
    Math.abs(other.x - rect.x) < 0.75 &&
    Math.abs(other.y - rect.y) < 0.75 &&
    Math.abs(other.width - rect.width) < 0.75 &&
    Math.abs(other.height - rect.height) < 0.75) === index);
  return { rectangles: dedupe(rectangles), lines, images: dedupe(images) };
}

module.exports = { extractGraphics };
