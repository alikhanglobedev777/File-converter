import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiDownload, FiEdit2, FiFile, FiFolder, FiRefreshCw, FiTrash2, FiUploadCloud } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import './MyFiles.css';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '') + '/api/files';
const bytes = value => value < 1048576 ? (value / 1024).toFixed(1) + ' KB' : (value / 1048576).toFixed(1) + ' MB';
const safeOutputName = value => (value || 'document').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f]/g, '');

export default function MyFiles() {
  const { user } = useContext(AuthContext);
  const [items, setItems] = useState([]);
  const [limits, setLimits] = useState({ count: 10, bytes: 25 * 1048576, perFileBytes: 5 * 1048576 });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editingId, setEditingId] = useState('');
  const [newName, setNewName] = useState('');
  const fileInputRef = useRef(null);
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;

  const load = useCallback(async (signal) => {
    if (!user || !token) return;
    try {
      const response = await fetch(API, { headers: { Authorization: 'Bearer ' + token }, signal });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not load saved files.');
      if (signal?.aborted) return;
      setItems(json.items || []);
      if (json.limits) setLimits(json.limits);
    } catch (err) {
      if (!signal?.aborted && err.name !== 'AbortError') setError(err.message || 'Could not load files.');
    }
  }, [user, token]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const uploadFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!token) return setError('Log in to save files.');
    if (file.size <= 0 || file.size > limits.perFileBytes) {
      return setError('Select a file no larger than ' + bytes(limits.perFileBytes) + '.');
    }
    setBusy('upload');
    setError('');
    setNotice('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(API, {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not save file.');
      setNotice('File saved to your private dashboard.');
      await load();
    } catch (err) { setError(err.message || 'Could not save file.'); }
    finally { setBusy(''); }
  };

  const download = async item => {
    if (!token || busy) return;
    setBusy(item.id);
    setError('');
    try {
      const response = await fetch(API + '/' + item.id + '/download', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || 'Unable to download the file.');
      }
      const blob = await response.blob();
      if (!blob.size || blob.size !== item.bytes) throw new Error('Download was incomplete.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = safeOutputName(item.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { setError(err.message || 'Unable to download the file.'); }
    finally { setBusy(''); }
  };

  const rename = async item => {
    if (!token || busy) return;
    setBusy(item.id);
    setError('');
    try {
      const response = await fetch(API + '/' + item.id, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Cannot rename this file.');
      setEditingId('');
      await load();
    } catch (err) { setError(err.message || 'Cannot rename this file.'); }
    finally { setBusy(''); }
  };

  const remove = async item => {
    if (!token || busy || !window.confirm('Permanently delete "' + item.name + '" from your dashboard?')) return;
    setBusy(item.id);
    setError('');
    try {
      const response = await fetch(API + '/' + item.id, {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Could not delete the file.');
      setNotice('File permanently deleted.');
      await load();
    } catch (err) { setError(err.message || 'Could not delete the file.'); }
    finally { setBusy(''); }
  };

  if (!user || !token) return <div className="my-files">
    <span className="eyebrow">PRIVATE DOCUMENT DASHBOARD</span>
    <h1>My Files</h1>
    <div className="my-files__empty"><FiFolder size={40}/><h2>Sign in to manage your files</h2>
      <p>Create an account to save selected files, download them again and organize your private space.</p>
      <div className="my-files__actions"><Link className="button button--primary" to="/signup" state={{ next: '/my-files' }}>Create account</Link>
        <Link className="button" to="/login" state={{ next: '/my-files' }}>Log in</Link></div>
    </div>
  </div>;

  const used = items.reduce((sum, item) => sum + (item.bytes || 0), 0);
  return <div className="my-files">
    <div className="my-files__heading">
      <div><span className="eyebrow">YOUR PRIVATE FILE DASHBOARD</span><h1>My Files</h1>
        <p>Save documents you choose, then download, rename or delete them anytime. Conversion history is separate.</p></div>
      <div className="my-files__actions">
        <button className="button" type="button" onClick={() => load()} disabled={!!busy}><FiRefreshCw /> Refresh</button>
        <button className="button button--primary" type="button" disabled={!!busy || items.length >= limits.count || used >= limits.bytes}
          onClick={() => fileInputRef.current?.click()}><FiUploadCloud /> Save a file</button>
      </div>
    </div>
    <input ref={fileInputRef} type="file" hidden
      accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx,.txt"
      aria-label="Choose a file to save privately" onChange={uploadFile} />
    <div className="my-files__quota">
      <strong>{items.length} of {limits.count} files</strong>
      <span>{bytes(used)} of {bytes(limits.bytes)} used · Max {bytes(limits.perFileBytes)} per file</span>
      <progress value={used} max={limits.bytes} aria-label="Private file storage used" />
    </div>
    {error && <p role="alert" className="my-files__error">{error}</p>}
    {notice && <p role="status" className="my-files__notice">{notice}</p>}
    {items.length === 0 && <div className="my-files__empty">
      <FiFolder size={38}/><h2>No files saved yet</h2>
      <p>Use Save a file above, or save a finished conversion to this dashboard while logged in.</p>
    </div>}
    <div className="my-files__list">
      {items.map(item => <div className="my-files__item" key={item.id}>
        <FiFile aria-hidden="true"/>
        <div className="my-files__details">
          {editingId === item.id ? <form onSubmit={event => {event.preventDefault(); rename(item);}}>
            <label htmlFor={'rename-' + item.id}>New filename (keep extension)</label>
            <input id={'rename-' + item.id} value={newName} onChange={event => setNewName(event.target.value)}
              maxLength={120} required />
            <button type="submit" className="button" disabled={!!busy}>Save</button>
            <button type="button" className="button" onClick={() => setEditingId('')}>Cancel</button>
          </form> : <strong title={item.name}>{item.name}</strong>}
          <small>{bytes(item.bytes)} · {new Date(item.createdAt).toLocaleString()}</small>
        </div>
        <div className="my-files__item-actions">
          <button className="button" type="button" disabled={!!busy} onClick={() => download(item)}
            aria-label={'Download ' + item.name}><FiDownload /> Download</button>
          <button className="button" type="button" disabled={!!busy} onClick={() => {
            setEditingId(item.id); setNewName(item.name);
          }} aria-label={'Rename ' + item.name}><FiEdit2 /></button>
          <button className="button my-files__delete" type="button" disabled={!!busy}
            onClick={() => remove(item)} aria-label={'Delete ' + item.name}><FiTrash2 /></button>
        </div>
      </div>)}
    </div>
    <p className="my-files__privacy">Files you explicitly save are stored privately in MongoDB and stay there until you delete them, subject to service availability and storage limits. Files aren't auto-saved, and other accounts cannot access them. Don't use this free workspace as your only backup.</p>
  </div>;
}
