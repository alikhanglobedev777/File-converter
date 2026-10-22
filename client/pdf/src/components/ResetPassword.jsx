import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiLock } from "react-icons/fi";
import AuthAside from "./AuthAside";
import "./auth.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

function readToken() {
  // URL fragments are not sent to Render in HTTP requests.
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  return typeof token === "string" && /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

export default function ResetPassword() {
  const [token] = useState(readToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Remove the token from browser history/address bar.
    window.history.replaceState(window.history.state, "", window.location.pathname);
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!token) return setError("Your reset link is invalid or has expired. Request a new one.");
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 8 || password.length > 128) return setError("Use 8 to 128 characters.");
    setSubmitting(true);
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The reset link is no longer valid.");
      setMessage(data.message || "Password updated. Please log in.");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err.message || "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="auth-layout"><div className="auth-card">
    <div className="auth-card__heading"><span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>Choose a new password</h1>
      <p>This link works once and expires 10 minutes after you request it.</p>
    </div>
    {message && <p className="auth-status" role="status">{message} <Link to="/login">Log in</Link></p>}
    {error && <p className="auth-status auth-status--error" role="alert">{error}</p>}
    {!token && <p className="auth-status auth-status--error">No valid reset token found. <Link to="/forgot-password">Request a new link</Link>.</p>}
    {!message && token && <form className="auth-form" onSubmit={onSubmit}>
      <label htmlFor="reset-password">New password</label>
      <div className="auth-field"><FiLock aria-hidden="true" />
        <input id="reset-password" type="password" minLength={8} maxLength={128} required
          autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <label htmlFor="confirm-password">Confirm new password</label>
      <div className="auth-field"><FiLock aria-hidden="true" />
        <input id="confirm-password" type="password" minLength={8} maxLength={128} required
          autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
      </div>
      <button className="button button--primary auth-submit" type="submit" disabled={submitting}>
        {submitting ? "Updating…" : <>Reset password <FiArrowRight /></>}
      </button>
    </form>}
    <p className="auth-card__bottom"><Link to="/login"><FiArrowLeft /> Back to login</Link></p>
  </div><AuthAside /></div>;
}
