import React, { useState, useContext, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FaUserCircle, FaBars, FaTimes } from "react-icons/fa";
import { AuthContext } from "../context/AuthContext";
import "./Navbar.css";

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const [menuOpen, setMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false); // dropdown state
  const navigate = useNavigate();
  const dropdownRef = useRef();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setServicesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <nav className="navbar">
      {/* Logo */}
      <div className="logo" onClick={() => navigate("/")}>
        AK File Converter
      </div>

      {/* Center Links */}
      <ul className={`nav-links ${menuOpen ? "active" : ""}`}>
        {/* Individual links */}
        <li><Link to="/pdf-to-excel" onClick={() => setMenuOpen(false)}>PDF → Excel</Link></li>
        <li><Link to="/pdf-to-word" onClick={() => setMenuOpen(false)}>PDF → Word</Link></li>
        <li><Link to="/pdf-to-jpg" onClick={() => setMenuOpen(false)}>PDF → JPG</Link></li>
        <li><Link to="/pdf-to-ppt" onClick={() => setMenuOpen(false)}>PDF → PowerPoint</Link></li>
        <li><Link to="/excel-to-pdf" onClick={() => setMenuOpen(false)}>Excel → PDF</Link></li>
        <li><Link to="/excel-to-word" onClick={() => setMenuOpen(false)}>Excel → Word</Link></li>
        <li><Link to="/excel-to-ppt" onClick={() => setMenuOpen(false)}>Excel → PowerPoint</Link></li>

        {/* Dropdown: All Services */}
        <li className="dropdown" ref={dropdownRef}>
          <span
            onClick={() => setServicesOpen(!servicesOpen)}
            className="dropdown-btn"
          >
            All Services {servicesOpen ? "▲" : "▼"}
          </span>
          <ul className={`dropdown-menu ${servicesOpen ? "open" : ""}`}>
            <li><Link to="/pdf-to-excel" onClick={() => setMenuOpen(false)}>PDF → Excel</Link></li>
            <li><Link to="/pdf-to-word" onClick={() => setMenuOpen(false)}>PDF → Word</Link></li>
            <li><Link to="/pdf-to-jpg" onClick={() => setMenuOpen(false)}>PDF → JPG</Link></li>
            <li><Link to="/pdf-to-ppt" onClick={() => setMenuOpen(false)}>PDF → PowerPoint</Link></li>
            <li><Link to="/excel-to-pdf" onClick={() => setMenuOpen(false)}>Excel → PDF</Link></li>
            <li><Link to="/excel-to-word" onClick={() => setMenuOpen(false)}>Excel → Word</Link></li>
            <li><Link to="/excel-to-ppt" onClick={() => setMenuOpen(false)}>Excel → PowerPoint</Link></li>
            <li><Link to="/pdf-merger" onClick={() => setMenuOpen(false)}>PDF Merger</Link></li>
            <li><Link to="/zip-maker" onClick={() => setMenuOpen(false)}>ZIP Maker</Link></li>
          </ul>
        </li>

        {/* Mobile Auth inside menu */}
        <div className="mobile-auth">
          {!user ? (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)}>Login</Link>
              <Link to="/signup" onClick={() => setMenuOpen(false)}>Sign Up</Link>
            </>
          ) : (
            <>
              <span className="mobile-user">{user.name}</span>
              <button onClick={handleLogout}>Logout</button>
            </>
          )}
        </div>
      </ul>

      {/* Desktop Auth */}
      <div className="nav-auth">
        {!user ? (
          <>
            <Link to="/login" className="auth-btn">Login</Link>
            <Link to="/signup" className="auth-btn primary">Sign Up</Link>
          </>
        ) : (
          <div className="user-box">
            <FaUserCircle className="user-icon" />
            <span>{user.name}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>

      {/* Hamburger */}
      <div className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <FaTimes /> : <FaBars />}
      </div>
    </nav>
  );
};

export default Navbar;
