import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import './auth.css';

const Signup = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault(); // ✅ stops page reload & overflow

    if (!name || !email || !password) {
      toast.error("All fields are required");
      return;
    }

    try {
      await axios.post("http://localhost:5000/api/auth/signup", { name, email, password });

      toast.success("Signup successful! Please login.");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.error || "Signup failed");
      console.error("Signup frontend error:", err);
    }
  };

  return (
    <div className="auth-container">
      <h2>Signup</h2>

      {/* ✅ Wrap in form */}
      <form onSubmit={handleSignup}>
        <input
          type="text"
          placeholder="Name"
          value={name}
          required
          onChange={(e) => setName(e.target.value)}
        />

        <input
          type="email"
          placeholder="Email"
          value={email}
          required
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          required
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />

        <button type="submit">Signup</button>
      </form>
    </div>
  );
};

export default Signup;
