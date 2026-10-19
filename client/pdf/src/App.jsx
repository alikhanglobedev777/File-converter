import { BrowserRouter as Router, Link, Navigate, Route, Routes } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Navbar from "./components/Navbar";
import Home from "./components/Home";
import FileConverter from "./components/FileConverter";
import Login from "./components/Login";
import Signup from "./components/Signup";
import History from "./components/History";
import { services } from "./data/services";

export default function App() {
  return (
    <Router>
      <Navbar>
        <Routes>
          <Route path="/" element={<Home />} />
          {services.map((tool) => <Route key={tool.id} path={`/${tool.id}`} element={<FileConverter key={tool.id} service={tool.id} />} />)}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/history" element={<History />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="*" element={<div className="not-found"><span className="eyebrow">PAGE NOT FOUND</span><h1>Looks like this page moved.</h1><p>The file tool you're looking for might be somewhere else.</p><Link to="/" className="button button--primary"><FiArrowLeft /> Back to workspace</Link></div>} />
        </Routes>
      </Navbar>
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar theme="light" />
    </Router>
  );
}
