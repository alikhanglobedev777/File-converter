import { useContext, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { FiArrowRight, FiLock, FiMail } from "react-icons/fi";
import { AuthContext } from "../context/AuthContext";
import AuthAside from "./AuthAside";
import "./auth.css";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Login failed");
      localStorage.setItem("token", data.token);
      login({ name: data.name, email: data.email });
      toast.success(`Welcome back, ${data.name}!`);
      navigate("/");
    } catch (error) {
      toast.error(error.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-layout"><div className="auth-card"><div className="auth-card__heading"><span className="eyebrow">WELCOME BACK</span><h1>Log in to your account</h1><p>Your file workspace is ready when you are.</p></div><form onSubmit={handleSubmit} className="auth-form">
      <label htmlFor="login-email">Email address</label><div className="auth-field"><FiMail aria-hidden="true" /><input id="login-email" type="email" placeholder="you@example.com" autoComplete="email" value={email} required onChange={(event) => setEmail(event.target.value)} /></div>
      <label htmlFor="login-password">Password</label><div className="auth-field"><FiLock aria-hidden="true" /><input id="login-password" type="password" placeholder="Enter your password" autoComplete="current-password" value={password} required onChange={(event) => setPassword(event.target.value)} /></div>
      <div className="auth-recovery-link"><Link to="/forgot-password">Forgot password?</Link></div>
      <button className="button button--primary auth-submit" type="submit" disabled={submitting}>{submitting ? "Signing in…" : <>Log in <FiArrowRight /></>}</button>
    </form><p className="auth-card__bottom">New around here? <Link to="/signup">Create an account <FiArrowRight aria-hidden="true" /></Link></p></div><AuthAside /></div>
  );
}
