// Group PDF text by its original vertical position, separating distant columns.
function spatialRows(items) {
  const rows = [];
  for (const item of [...items].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const height = Math.max(1, item.size || 10);
    let row = rows.find(r => Math.abs(r.y - item.y) <= Math.max(2, Math.min(r.height, height) * 0.3));
    if (!row) { row = { y: item.y, height, items: [] }; rows.push(row); }
    row.items.push(item);
    row.height = Math.max(row.height, height);
  }
  return rows.sort((a,b) => a.y-b.y).map(row => {
    const segments = [];
    for (const item of row.items.sort((a,b) => a.x-b.x)) {
      const prev = segments.at(-1);
      const gap = prev ? item.x - (prev.x + prev.width) : Infinity;
      if (prev && gap <= Math.max(5, (item.size || 10) * 0.65)) {
        prev.text += (gap > Math.max(1.5, item.size * 0.15) ? ' ' : '') + item.text;
        prev.width = Math.max(prev.width, item.x + (item.width || 0) - prev.x);
        prev.items.push(item);
      } else segments.push({ x:item.x, width:item.width || 0, text:item.text, items:[item] });
    }
    return { y:row.y, height:row.height, segments };
  });
}
module.exports = { spatialRows };
