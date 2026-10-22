import { useContext, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowRight, FiChevronRight, FiGrid, FiHome, FiLogOut,
  FiMenu, FiShield, FiX, FiClock, FiFileText,
} from "react-icons/fi";
import { AuthContext } from "../context/AuthContext";
import { getService, serviceGroups, services } from "../data/services";
import ToolIcon from "./ToolIcon";
import "./Navbar.css";

export default function Navbar({ children }) {
  const { user, logout } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);
  const activeTool = getService(location.pathname.slice(1));

  useEffect(() => {
    if (!menuOpen) return undefined;

    // Keep the page still and keyboard focus inside the small-screen drawer.
    const oldOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(sidebarRef.current?.querySelectorAll('a[href], button:not([disabled])') || [])];
    focusable()[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      } else if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    const closeOnDesktop = (event) => { if (event.matches) setMenuOpen(false); };
    const desktopQuery = window.matchMedia("(min-width: 1001px)");
    desktopQuery.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      desktopQuery.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);
  const handleLogout = () => {
    logout();
    closeMenu();
    navigate("/login");
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {menuOpen && (
        <button className="sidebar-backdrop" aria-label="Close navigation" onClick={closeMenu} />
      )}
      <nav id="mobile-sidebar" ref={sidebarRef} className={`sidebar ${menuOpen ? "sidebar--open" : ""}`} aria-label="Primary navigation">
        <Link to="/" className="brand" onClick={closeMenu}>
          <span className="brand__mark" aria-hidden="true"><FiGrid /></span>
          <span className="brand__name"><strong>AK</strong> Converter<span className="brand__dot">.</span><small>YOUR FILE WORKSPACE</small></span>
        </Link>

        <div className="sidebar__scroll">
          <div className="sidebar__section">
            <p className="sidebar__label">WORKSPACE</p>
            <NavLink to="/" end onClick={closeMenu} className={({ isActive }) => `sidebar__item ${isActive ? "sidebar__item--active" : ""}`}>
              <FiHome aria-hidden="true" /> <span>Overview</span><FiChevronRight className="sidebar__chevron" aria-hidden="true" />
            </NavLink>
            <NavLink to="/ocr" onClick={closeMenu} className={({ isActive }) => `sidebar__item ${isActive ? "sidebar__item--active" : ""}`}><FiFileText aria-hidden="true" /><span>Scanned PDF OCR</span><FiChevronRight className="sidebar__chevron" aria-hidden="true" /></NavLink>
            {user && <NavLink to="/history" onClick={closeMenu} className={({ isActive }) => `sidebar__item ${isActive ? "sidebar__item--active" : ""}`}><FiClock aria-hidden="true" /><span>My History</span><FiChevronRight className="sidebar__chevron" aria-hidden="true" /></NavLink>}
            <a href="/#tools" onClick={closeMenu} className="sidebar__item">
              <FiGrid aria-hidden="true" /> <span>All tools</span><span className="sidebar__count">{services.length}</span>
            </a>
          </div>

          {serviceGroups.map((group) => (
            <div className="sidebar__section" key={group.title}>
              <p className="sidebar__label">{group.title.toUpperCase()}</p>
              {group.ids.map((id) => {
                const tool = getService(id);
                return (
                  <NavLink key={id} to={`/${id}`} onClick={closeMenu} className={({ isActive }) => `sidebar__item ${isActive ? "sidebar__item--active" : ""}`}>
                    <ToolIcon name={tool.icon} /> <span>{tool.title}</span><FiChevronRight className="sidebar__chevron" aria-hidden="true" />
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>

        <div className="sidebar__bottom">
          <div className="sidebar__help">
            <span className="sidebar__help-icon"><FiShield aria-hidden="true" /></span>
            <strong>Simple file tools</strong>
            <p>Convert, organize, and download from one place.</p>
            <Link to="/#how-it-works" onClick={closeMenu}>How it works <FiArrowRight aria-hidden="true" /></Link>
          </div>
          <p className="sidebar__copyright">© {new Date().getFullYear()} AK Converter</p>
        </div>
      </nav>

      <div className="app-stage">
        <header className="topbar">
          <div className="topbar__left">
            <button ref={menuButtonRef} className="topbar__menu icon-button" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-controls="mobile-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
              {menuOpen ? <FiX /> : <FiMenu />}
            </button>
            <div className="topbar__crumbs">
              <Link to="/">Workspace</Link>
              <FiChevronRight aria-hidden="true" />
              <span>{activeTool?.title || (location.pathname === "/" ? "Overview" : location.pathname === "/login" ? "Log in" : location.pathname === "/signup" ? "Sign up" : location.pathname === "/history" ? "My History" : location.pathname === "/forgot-password" ? "Forgot password" : location.pathname === "/ocr" ? "Scanned PDF OCR" : location.pathname === "/reset-password" ? "Reset password" : "Page not found")}</span>
            </div>
          </div>
          <div className="topbar__right">
            <span className="topbar__status"><span /> {services.length} tools to explore</span>
            {user ? (
              <div className="topbar__account">
                <span className="topbar__avatar" aria-hidden="true">{(user.name || "U").charAt(0).toUpperCase()}</span>
                <span className="topbar__username">{user.name}</span>
                <button type="button" className="topbar__logout" onClick={handleLogout} aria-label="Log out" title="Log out"><FiLogOut /></button>
              </div>
            ) : (
              <div className="topbar__auth">
                {location.pathname !== "/login" && <Link to="/login" className="topbar__login">Log in</Link>}
                {location.pathname !== "/signup" && <Link to="/signup" className="button button--primary button--small">Get started <FiArrowRight aria-hidden="true" /></Link>}
              </div>
            )}
          </div>
        </header>
        <main className="main-content" id="main-content">{children}</main>
        <footer className="site-footer"><span>AK Converter · Made for everyday files.</span><span>PDF · Excel · Word · Images · ZIP</span></footer>
      </div>
    </div>
  );
}
