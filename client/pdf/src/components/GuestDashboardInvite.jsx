import { useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiFolder, FiLock, FiX } from 'react-icons/fi';
import { AuthContext } from '../context/AuthContext';
import './GuestDashboardInvite.css';

const SEEN_KEY = 'ak_converter_dashboard_invite_seen_session_v1';
export default function GuestDashboardInvite() {
  const { user } = useContext(AuthContext);
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const previousFocusRef = useRef(null);
  useEffect(() => {
    if (user) return undefined;
    try { if (sessionStorage.getItem(SEEN_KEY)) return undefined; }
    catch { return undefined; }
    const timer = window.setTimeout(() => {
      previousFocusRef.current = document.activeElement;
      setOpen(true);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [user]);
  const dismiss = () => {
    try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* privacy-restricted browser */ }
    setOpen(false);
    previousFocusRef.current?.focus?.();
  };
  useEffect(() => {
    if (!open || user) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { dismiss(); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(document.querySelectorAll('.dashboard-invite__dialog a, .dashboard-invite__dialog button'));
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKey); };
  }, [open, user]);
  if (!open || user) return null;
  return <div className="dashboard-invite" role="presentation" onMouseDown={event => {
    if (event.target === event.currentTarget) dismiss();
  }}>
    <section className="dashboard-invite__dialog" role="dialog" aria-modal="true"
      aria-labelledby="dashboard-invite-heading" aria-describedby="dashboard-invite-description">
      <button ref={closeRef} className="dashboard-invite__close" type="button" aria-label="Close registration invitation"
        onClick={dismiss}><FiX /></button>
      <div className="dashboard-invite__icon"><FiFolder /></div>
      <span className="eyebrow">YOUR PRIVATE SPACE</span>
      <h2 id="dashboard-invite-heading">Want your own file dashboard?</h2>
      <p id="dashboard-invite-description">Register or log in to save selected documents, download them later, rename files, and keep everything organized in one private place.</p>
      <div className="dashboard-invite__buttons">
        <Link to="/signup" state={{ next: '/my-files' }} className="button button--primary" onClick={dismiss}>Create free account</Link>
        <Link to="/login" state={{ next: '/my-files' }} className="button" onClick={dismiss}>Log in</Link>
      </div>
      <small><FiLock /> Conversions stay available without an account. You choose what to save.</small>
      <button type="button" className="dashboard-invite__later" onClick={dismiss}>Maybe later</button>
    </section>
  </div>;
}
