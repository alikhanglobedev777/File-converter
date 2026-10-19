import { useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiClock, FiFileText, FiRefreshCw, FiTrash2, FiXCircle } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import './History.css';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
const timestamp = (value) => value ? new Date(value).toLocaleString() : '—';
const toolLabel = (value) => (value || '').split('-').map(part => part.toUpperCase() === 'PDF' ? 'PDF' : part.charAt(0).toUpperCase() + part.slice(1)).join(' ');

export default function History() {
  const { user } = useContext(AuthContext);
  const [data, setData] = useState({ items: [], total: 0, successful: 0, failed: 0, page: 1, totalPages: 1, retentionDays: 30 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async (signal) => {
    const token = localStorage.getItem('token');
    if (!user || !token) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/history?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` }, signal,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session has expired. Please log in again.' : json.error || 'Could not load history.');
      if (signal?.aborted) return;
      setData(json);
      if (page > 1 && json.totalPages < page) setPage(json.totalPages);
    } catch (err) {
      if (err.name !== 'AbortError' && !signal?.aborted) setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, user]);

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const remove = async (id = null) => {
    if (!window.confirm(id ? 'Delete this history record?' : 'Permanently clear all your conversion history?')) return;
    const token = localStorage.getItem('token');
    if (!token) { setError('Please log in again.'); return; }
    setBusyId(id || 'all');
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/history${id ? `/${id}` : ''}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 401 ? 'Your session has expired. Please log in again.' : json.error || 'Could not delete history.');
      if (!id && page !== 1) setPage(1);
      else await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (!user || !localStorage.getItem('token')) return (
    <div className="history-page">
      <span className="eyebrow">PRIVATE WORKSPACE</span>
      <h1>My History</h1>
      <div className="history-empty"><FiClock aria-hidden="true" /><h2>Log in to see your conversions</h2><p>Guest conversions aren't stored in history.</p><Link className="button button--primary" to="/login">Log in</Link></div>
    </div>
  );

  return (
    <div className="history-page">
      <div className="history-heading">
        <div><span className="eyebrow">YOUR PRIVATE WORKSPACE</span><h1>My History</h1><p>Conversion metadata retained for {data.retentionDays} days. Uploaded files and downloads are not stored here.</p></div>
        <button className="history-button" disabled={loading || busyId !== null} onClick={() => refresh()} type="button"><FiRefreshCw aria-hidden="true" /> Refresh</button>
      </div>
      <div className="history-stats" aria-label="Conversion totals">
        <div><span>Conversions</span><strong>{data.total}</strong></div>
        <div><span>Successful</span><strong>{data.successful}</strong></div>
        <div><span>Failed</span><strong>{data.failed}</strong></div>
      </div>
      {error && <div role="alert" className="history-error">{error} <button className="history-link" type="button" onClick={() => refresh()}>Try again</button></div>}
      <div className="history-panel">
        <div className="history-panel__heading"><div><h2>Recent conversions</h2><p>Only your own account's history is shown.</p></div>{data.total > 0 && <button type="button" className="history-button history-button--danger" disabled={busyId !== null || loading} onClick={() => remove()}><FiTrash2 aria-hidden="true" /> Clear all</button>}</div>
        {loading && data.items.length === 0 ? <p className="history-message" role="status">Loading history…</p> : null}
        {!loading && !error && data.items.length === 0 && <div className="history-empty"><FiFileText aria-hidden="true" /><h3>No conversions yet</h3><p>Convert a file while logged in and it will appear here.</p><Link to="/" className="button button--primary">Browse tools</Link></div>}
        {data.items.length > 0 && <div className="history-records">
          {data.items.map(entry => <div className="history-record" key={entry._id}>
            <div className="history-record__icon"><FiFileText aria-hidden="true" /></div>
            <div className="history-record__main"><strong title={entry.filename}>{entry.filename}</strong><span>{toolLabel(entry.conversionType)} · {timestamp(entry.createdAt)}{entry.fileCount > 1 ? ` · ${entry.fileCount} files` : ''}</span></div>
            <div className={`history-status history-status--${entry.status}`}>{entry.status === 'success' ? <FiCheckCircle aria-hidden="true" /> : <FiXCircle aria-hidden="true" />}{entry.status === 'success' ? 'Success' : 'Failed'}</div>
            <button className="history-delete" type="button" aria-label={`Delete history for ${entry.filename}`} title="Delete record" disabled={busyId !== null} onClick={() => remove(entry._id)}><FiTrash2 aria-hidden="true" /></button>
          </div>)}
        </div>}
        {data.totalPages > 1 && <div className="history-pagination"><button type="button" className="history-button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading || busyId !== null}><FiArrowLeft aria-hidden="true" /> Previous</button><span>Page {data.page} of {data.totalPages}</span><button type="button" className="history-button" onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages || loading || busyId !== null}>Next →</button></div>}
      </div>
      <p className="history-privacy"><FiClock aria-hidden="true" /> Records automatically expire after {data.retentionDays} days. Expiry may take a short time. History does not contain downloadable files.</p>
    </div>
  );
}
