function parseRgbColor(args, fallback = '000000') {
  const first = args && args[0];
  if (typeof first === 'string' && /^#?[0-9a-f]{6}$/i.test(first)) {
    return first.replace('#', '').toUpperCase();
  }
  const values = (Array.isArray(first) || ArrayBuffer.isView(first)) ? first : args;
  if (!values || values.length < 3 ||
      ![0, 1, 2].every(i => typeof values[i] === 'number')) return fallback;
  const rgb = Array.from(values).slice(0, 3);
  const unit = rgb.every(value => value >= 0 && value <= 1);
  return rgb.map(value => Math.max(0, Math.min(255,
    Math.round(unit ? value * 255 : value))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Interpret PDF.js drawing operators in *page* coordinates. PDF.js exposes
// constructPath as [pathOperators, flatCoordinates, bounds], NOT an array of
// painted rectangles; the painting operation follows it in the operator list.
function extractGraphics(operatorList, OPS, Util, viewport) {
  const rectangles = [], lines = [], images = [];
  const stack = [];
  let state = { matrix: [1, 0, 0, 1, 0, 0], fill: '000000', stroke: '000000', lineWidth: 1 };
  let pendingRects = [], pendingLines = [];


  const transform = (point) => {
    // pdfjs-dist 5.x may mutate the point and return undefined; older
    // versions returned a new point. Support both contracts.
    const copy = [point[0], point[1]];
    const result = Util.applyTransform(copy,
      Util.transform(viewport.transform, state.matrix));
    return Array.isArray(result) || ArrayBuffer.isView(result) ? result : copy;
  };
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
      state.fill = parseRgbColor(args, state.fill);
    } else if (op === OPS.setStrokeRGBColor) {
      state.stroke = parseRgbColor(args, state.stroke);
    } else if (op === OPS.setLineWidth) {
      state.lineWidth = Number(args[0]) || 1;
    } else if (op === OPS.constructPath) {
      // pdfjs-dist 5.4 uses [paintOperator, [encodedPaths], bounds].
      // Each encoded rectangle is move(0), line(1)x3, close(4).
      // Older formats expose [pathOps, flatCoordinates] instead.
      if (typeof args[0] === 'number' && Array.isArray(args[1]) &&
          args[1].some(path => Array.isArray(path) || ArrayBuffer.isView(path))) {
        const paintOperator = args[0];
        for (const data of args[1]) {
          if (!data || data.length < 6) continue;
          if (data.length === 13 &&
              data[0] === 0 && data[3] === 1 && data[6] === 1 &&
              data[9] === 1 && data[12] === 4) {
            const corners = [1, 4, 7, 10].map(index =>
              transform([data[index], data[index + 1]]));
            const xs = corners.map(p => p[0]), ys = corners.map(p => p[1]);
            const x = Math.min(...xs), y = Math.min(...ys);
            const width = Math.max(...xs) - x, height = Math.max(...ys) - y;
            if (width >= 1 && height >= 1) {
              pendingRects.push({ x, y, width, height });
            }
          } else {
            let offset = 0, cursor, first;
            while (offset < data.length) {
              const instruction = data[offset++];
              if (instruction === 0 && offset + 1 < data.length) {
                cursor = [data[offset], data[offset + 1]];
                first = cursor; offset += 2;
              } else if (instruction === 1 && offset + 1 < data.length) {
                const next = [data[offset], data[offset + 1]];
                pushLine(cursor, next);
                cursor = next; offset += 2;
              } else if (instruction === 4) {
                pushLine(cursor, first);
                cursor = first;
              } else break;
            }
          }
        }
        paint(paintOperator);
        continue;
      }
      // Some PDF producers expose individual drawing commands as a scalar.

      // previous code assumed every constructPath argument was an array.
      const rawCommands = args[0];
      const commands = typeof rawCommands === 'number'
        ? [rawCommands]
        : (Array.isArray(rawCommands) || ArrayBuffer.isView(rawCommands)
          ? rawCommands : []);
      const coords = Array.isArray(args[1]) || ArrayBuffer.isView(args[1])
        ? args[1] : [];
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
    } else if (op === OPS.endPath) {
      pendingRects = [];
      pendingLines = [];
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

module.exports = { extractGraphics, parseRgbColor };
