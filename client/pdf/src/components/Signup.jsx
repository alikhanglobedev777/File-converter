import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FiArrowRight, FiLock, FiMail, FiUser } from "react-icons/fi";
import AuthAside from "./AuthAside";
import "./auth.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Signup failed");
      toast.success("Account created. Log in to continue.");
      navigate("/login");
    } catch (error) {
      toast.error(error.message || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout"><div className="auth-card"><div className="auth-card__heading"><span className="eyebrow">GET STARTED</span><h1>Create your account</h1><p>A little space for all the files you work with.</p></div><form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor="signup-name">Full name</label><div className="auth-field"><FiUser aria-hidden="true" /><input id="signup-name" type="text" placeholder="Your name" autoComplete="name" minLength={2} value={name} required onChange={(event) => setName(event.target.value)} /></div>
      <label htmlFor="signup-email">Email address</label><div className="auth-field"><FiMail aria-hidden="true" /><input id="signup-email" type="email" placeholder="you@example.com" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></div>
      <label htmlFor="signup-password">Password</label><div className="auth-field"><FiLock aria-hidden="true" /><input id="signup-password" type="password" placeholder="At least 6 characters" autoComplete="new-password" minLength={6} value={password} required onChange={(event) => setPassword(event.target.value)} /></div>
      <button className="button button--primary auth-submit" type="submit" disabled={submitting}>{submitting ? "Creating account…" : <>Create account <FiArrowRight /></>}</button>
    </form><p className="auth-card__bottom">Already have an account? <Link to="/login">Log in <FiArrowRight aria-hidden="true" /></Link></p></div><AuthAside /></div>
  );
}
