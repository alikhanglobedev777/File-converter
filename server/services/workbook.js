const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const fs = require('node:fs/promises');

async function readWorkbook(filename) {
  const buffer = await fs.readFile(filename);
  const workbook = new ExcelJS.Workbook();
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) await workbook.xlsx.load(buffer);
  else {
    // The legacy .xls reader is used only for the old binary format.
    if (buffer.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1') throw new Error('Invalid Excel file');
    const legacy = XLSX.read(buffer, { type: 'buffer' });
    await workbook.xlsx.load(XLSX.write(legacy, { type: 'buffer', bookType: 'xlsx' }));
  }
  if (!workbook.worksheets.length) throw new Error('Workbook contains no sheets');
  return workbook;
}
function displayCell(cell) {
  let value = cell.value;
  if (value == null) return '';
  if (typeof value === 'object' && 'formula' in value) value = value.result ?? '';
  if (typeof value === 'number' && cell.numFmt) {
    try { return XLSX.SSF.format(cell.numFmt, value); } catch { /* plain value fallback */ }
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object' && value.richText) return value.richText.map(t => t.text).join('');
  if (typeof value === 'object') return value.text || value.error || '';
  return String(value);
}
function color(value, fallback) { return value?.argb?.slice(-6) || fallback; }
module.exports = { readWorkbook, displayCell, color };
