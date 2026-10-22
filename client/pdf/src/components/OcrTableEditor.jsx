import { useState } from "react";
import { FiDownload, FiPlus, FiRefreshCw, FiTrash2 } from "react-icons/fi";
import { proposeOcrTable, ocrTableHasContent, OCR_TABLE_MAX_ROWS, OCR_TABLE_MAX_COLUMNS } from "../utils/ocrTables";
import { validateDownload } from "../utils/downloadFormat";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");
const makeTables = (pages, delimiter) => pages.map(item => ({
  page: item.page, rows: proposeOcrTable(item.text, delimiter),
}));

export default function OcrTableEditor({ pages }) {
  const [delimiter, setDelimiter] = useState("auto");
  const [tables, setTables] = useState(() => makeTables(pages, "auto"));
  const [activePage, setActivePage] = useState(pages[0]?.page || 1);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const table = tables.find(item => item.page === activePage);
  const columns = Math.max(1, ...((table?.rows || []).map(row => row.length)));

  const regenerate = (value) => {
    setDelimiter(value);
    setTables(makeTables(pages, value));
    setError("");
  };
  const editCell = (row, column, value) => setTables(items => items.map(item =>
    item.page === activePage ? {
      ...item, rows: item.rows.map((cells, index) => {
        if (index !== row) return cells;
        const next = [...cells];
        while (next.length <= column) next.push("");
        next[column] = value.slice(0, 256);
        return next;
      }),
    } : item));
  const addRow = () => {
    if (!table || table.rows.length >= OCR_TABLE_MAX_ROWS) return;
    setTables(items => items.map(item => item.page === activePage
      ? { ...item, rows: [...item.rows, Array(columns).fill("")] } : item));
  };
  const addColumn = () => {
    if (!table || columns >= OCR_TABLE_MAX_COLUMNS) return;
    setTables(items => items.map(item => item.page === activePage
      ? { ...item, rows: item.rows.map(row => [...row, ...Array(Math.max(0, columns-row.length)).fill(""), ""]) } : item));
  };
  const removeRow = (index) => setTables(items => items.map(item => item.page === activePage
    ? { ...item, rows: item.rows.filter((_, i) => i !== index) } : item));

  const exportExcel = async () => {
    if (exporting || !tables.some(item => ocrTableHasContent(item.rows))) return;
    setExporting(true);
    setError("");
    try {
      const submitted = tables.filter(item => ocrTableHasContent(item.rows));
      const response = await fetch(API_BASE_URL + "/api/ocr/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables: submitted }),
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || "Excel export failed");
      }
      const blob = await response.blob();
      const { filename } = await validateDownload("ocr-to-excel", response, blob, "reviewed-ocr-tables.pdf");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("Unable to export Excel. Review the row limits or use TXT instead.");
    } finally {
      setExporting(false);
    }
  };

  return <div className="ocr-table-editor">
    <h3>Review your Excel table</h3>
    <p>These are suggested rows, not verified table cells. Check every value, split or combine columns, then export. Do not rely on automatic table alignment.</p>
    <div className="ocr-table-controls">
      <label>Split text by
        <select value={delimiter} onChange={event => regenerate(event.target.value)}>
          <option value="auto">Tabs or multiple spaces (safer)</option>
          <option value="tabs">Tabs only</option>
          <option value="commas">Commas</option>
          <option value="spaces">All spaces (may split names)</option>
        </select>
      </label>
      <label>Page
        <select value={activePage} onChange={event => setActivePage(Number(event.target.value))}>
          {tables.map(item => <option key={item.page} value={item.page}>Page {item.page}</option>)}
        </select>
      </label>
      <button type="button" className="button" onClick={() => regenerate(delimiter)}>
        <FiRefreshCw /> Regenerate rows
      </button>
    </div>
    <p>Changing the separator or regenerating replaces your edits. No spreadsheet formulas are executed.</p>
    <div className="ocr-table-scroll">
      <table aria-label="Editable OCR table">
        <thead><tr><th>Row</th>{Array.from({ length: columns }, (_, index) =>
          <th key={index}>Column {index + 1}</th>)}<th>Remove</th></tr></thead>
        <tbody>{(table?.rows || []).map((row, rowIndex) => <tr key={rowIndex}>
          <th scope="row">{rowIndex + 1}</th>
          {Array.from({ length: columns }, (_, column) => <td key={column}>
            <input type="text" value={row[column] || ""} maxLength={256}
              aria-label={"Row " + (rowIndex + 1) + " column " + (column + 1)}
              onChange={event => editCell(rowIndex, column, event.target.value)} />
          </td>)}
          <td><button type="button" aria-label={"Remove row " + (rowIndex + 1)}
            onClick={() => removeRow(rowIndex)}><FiTrash2 /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="ocr-actions">
      <button type="button" className="button" onClick={addRow} disabled={!table || table.rows.length >= OCR_TABLE_MAX_ROWS}><FiPlus /> Add row</button>
      <button type="button" className="button" onClick={addColumn} disabled={!table || columns >= OCR_TABLE_MAX_COLUMNS}><FiPlus /> Add column</button>
      <button type="button" className="button button--primary" onClick={exportExcel}
        disabled={exporting || !tables.some(item => ocrTableHasContent(item.rows))}>
        <FiDownload /> {exporting ? "Creating Excel…" : "Download reviewed Excel"}
      </button>
    </div>
    <p className="ocr-export-privacy">Only edited cell text is sent to the AK Converter backend to create an XLSX. The original PDF remains in your browser. Treat OCR numbers and columns as unverified.</p>
    {error && <p role="alert" className="auth-status auth-status--error">{error}</p>}
  </div>;
}
