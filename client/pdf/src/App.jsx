import { useEffect } from "react";
import { BrowserRouter as Router, Link, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Navbar from "./components/Navbar";
import Home from "./components/Home";
import FileConverter from "./components/FileConverter";
import Login from "./components/Login";
import ForgotPassword from "./components/ForgotPassword";
import ResetPassword from "./components/ResetPassword";
import Signup from "./components/Signup";
import History from "./components/History";
import { services } from "./data/services";
import { LAST_WORKSPACE_ROUTE_KEY, isKnownWorkspacePath, recoverWorkspacePath } from "./utils/routeContinuity";

const workspacePaths = ["/", "/login", "/signup", "/history", "/forgot-password", ...services.map((tool) => `/${tool.id}`)];

// A Render SPA fallback or browser tab restoration can land on /index.html.
// Preserve the current *known* client route for this tab, and only restore a
// safe, local path. This does not store form data or uploaded files.
function RememberWorkspaceRoute() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (!isKnownWorkspacePath(pathname, workspacePaths)) return;
    try {
      sessionStorage.setItem(LAST_WORKSPACE_ROUTE_KEY, pathname);
    } catch {
      // Storage can be disabled. The alias below still falls back to home.
    }
  }, [pathname]);
  return null;
}

function RecoverIndexHtmlRoute() {
  let savedPath = null;
  try {
    savedPath = sessionStorage.getItem(LAST_WORKSPACE_ROUTE_KEY);
  } catch {
    // Use the workspace home when session storage is blocked.
  }
  return <Navigate to={recoverWorkspacePath(savedPath, workspacePaths)} replace />;
}


export default function App() {
  return (
    <Router>
      <RememberWorkspaceRoute />
      <Navbar>
        <Routes>
          <Route path="/" element={<Home />} />
          {services.map((tool) => <Route key={tool.id} path={`/${tool.id}`} element={<FileConverter key={tool.id} service={tool.id} />} />)}
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/history" element={<History />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/index.html" element={<RecoverIndexHtmlRoute />} />
          <Route path="*" element={<div className="not-found"><span className="eyebrow">PAGE NOT FOUND</span><h1>Looks like this page moved.</h1><p>The file tool you're looking for might be somewhere else.</p><Link to="/" className="button button--primary"><FiArrowLeft /> Back to workspace</Link></div>} />
        </Routes>
      </Navbar>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar theme="light" />
    </Router>
  );
}
