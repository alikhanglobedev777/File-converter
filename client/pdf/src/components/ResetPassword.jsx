import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiLock, FiMail, FiShield } from "react-icons/fi";
import AuthAside from "./AuthAside";
import "./auth.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function ResetPassword() {
  const location = useLocation();
  const [email, setEmail] = useState(() => location.state?.email || "");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const verifyCode = async (event) => {
    event.preventDefault();
    setError("");
    if (!/^[0-9]{6}$/.test(code)) return setError("Enter the six-digit code from your email.");
    setSubmitting(true);
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The code is incorrect or expired.");
      setCode("");
      setResetToken(data.resetToken);
      setMessage("Email verified. Choose a new password below.");
    } catch (err) {
      setError(err.message || "Could not verify the code.");
    } finally {
      setSubmitting(false);
    }
  };

  const onReset = async (event) => {
    event.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match.");
    if (password.length < 8 || password.length > 128) return setError("Use 8 to 128 characters.");
    setSubmitting(true);
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetToken, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Verification expired. Request a new code.");
      setResetToken("");
      setPassword("");
      setConfirm("");
      setMessage(data.message || "Password updated. Please log in.");
    } catch (err) {
      setError(err.message || "Unable to reset your password.");
    } finally {
      setSubmitting(false);
    }
  };

  const complete = !resetToken && message.startsWith("Your password was reset.");
  return <div className="auth-layout"><div className="auth-card">
    <div className="auth-card__heading"><span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>{complete ? "Password updated" : resetToken ? "Create a new password" : "Enter your six-digit code"}</h1>
      <p>{complete ? "Your account is ready." : resetToken
        ? "Your code is verified. Set a new password within five minutes."
        : "Check your email for the verification code. Codes expire after 10 minutes and allow five attempts."}</p>
    </div>
    {message && <p className="auth-status" role="status">{message}</p>}
    {error && <p className="auth-status auth-status--error" role="alert">{error}</p>}
    {!resetToken && !complete && <form className="auth-form" onSubmit={verifyCode}>
      <label htmlFor="verify-email">Registered email address</label>
      <div className="auth-field"><FiMail aria-hidden="true" />
        <input id="verify-email" type="email" required maxLength={254} autoComplete="email"
          value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
      </div>
      <label htmlFor="verification-code">Six-digit verification code</label>
      <div className="auth-field"><FiShield aria-hidden="true" />
        <input id="verification-code" type="text" inputMode="numeric" pattern="[0-9]{6}"
          autoComplete="one-time-code" required maxLength={6} placeholder="000000"
          value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} />
      </div>
      <button className="button button--primary auth-submit" type="submit" disabled={submitting}>
        {submitting ? "Checking…" : <>Verify code <FiArrowRight /></>}
      </button>
    </form>}
    {resetToken && <form className="auth-form" onSubmit={onReset}>
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
        {submitting ? "Updating…" : <>Set new password <FiArrowRight /></>}
      </button>
    </form>}
    <p className="auth-card__bottom">
      {complete ? <Link to="/login">Log in now <FiArrowRight /></Link>
        : <Link to="/forgot-password"><FiArrowLeft /> Request another code</Link>}
    </p>
  </div><AuthAside /></div>;
}
