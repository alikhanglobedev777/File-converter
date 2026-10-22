import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiMail } from "react-icons/fi";
import AuthAside from "./AuthAside";
import "./auth.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const navigate = useNavigate();

  const onSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(API_BASE_URL + "/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to request a verification code.");
      // The backend deliberately responds identically for registered and
      // unknown addresses. Do not automatically open the verification screen:
      // that used to misleadingly imply an email was sent to every address.
      setSubmittedEmail(email.trim().toLowerCase());
      setStatusMessage(data.message || "If that email is registered, check your inbox for a code.");
    } catch (err) {
      setError(err.message || "Could not request a verification code.");
    } finally {
      setSubmitting(false);
    }
  };

  return <div className="auth-layout"><div className="auth-card">
    <div className="auth-card__heading"><span className="eyebrow">ACCOUNT RECOVERY</span>
      <h1>Forgot your password?</h1>
      <p>Enter the email address used to register. If an account exists, we'll send a six-digit code valid for 10 minutes.</p>
    </div>
    {error && <p className="auth-status auth-status--error" role="alert">{error}</p>}
    {statusMessage && <div className="auth-status" role="status">
      <p>{statusMessage}</p>
      <p>Check your inbox and spam folder. No email is sent for an unregistered address.</p>
      <button className="button button--primary auth-submit" type="button"
        onClick={() => navigate("/reset-password", { state: { email: submittedEmail } })}>
        I received a code — Verify it <FiArrowRight />
      </button>
    </div>}
    {!statusMessage && <form className="auth-form" onSubmit={onSubmit}>
      <label htmlFor="recovery-email">Registered email address</label>
      <div className="auth-field"><FiMail aria-hidden="true" />
        <input id="recovery-email" type="email" required maxLength={254} autoComplete="email"
          placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <button type="submit" className="button button--primary auth-submit" disabled={submitting}>
        {submitting ? "Sending…" : <>Send six-digit code <FiArrowRight /></>}
      </button>
    </form>}
    {statusMessage && <button className="button" type="button" onClick={() => {
      setStatusMessage(""); setSubmittedEmail(""); setError("");
    }}>Use a different email address</button>}
    <p className="auth-card__bottom"><Link to="/login"><FiArrowLeft /> Back to login</Link></p>
  </div><AuthAside /></div>;
}
