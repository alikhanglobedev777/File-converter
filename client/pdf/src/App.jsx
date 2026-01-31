import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import FileConverter from "./components/FileConverter";
import Login from "./components/Login";
import Signup from "./components/Signup";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const App = () => {
  return (
    <Router>
      <Navbar />
      <ToastContainer position="top-right" autoClose={2000} hideProgressBar />

      <Routes>
        {/* Default route */}
        <Route path="/" element={<Navigate to="/pdf-to-excel" />} />

        {/* PDF Conversions */}
        <Route path="/pdf-to-excel" element={<FileConverter service="pdf-to-excel" />} />
        <Route path="/pdf-to-word" element={<FileConverter service="pdf-to-word" />} />
        <Route path="/pdf-to-jpg" element={<FileConverter service="pdf-to-jpg" />} />
        <Route path="/pdf-to-ppt" element={<FileConverter service="pdf-to-ppt" />} />

        {/* Excel Conversions */}
        <Route path="/excel-to-pdf" element={<FileConverter service="excel-to-pdf" />} />
        <Route path="/excel-to-word" element={<FileConverter service="excel-to-word" />} />
        <Route path="/excel-to-ppt" element={<FileConverter service="excel-to-ppt" />} />

        {/* New Services */}
        <Route path="/pdf-merger" element={<FileConverter service="pdf-merger" />} />
        <Route path="/zip-maker" element={<FileConverter service="zip-maker" />} />

        {/* Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* 404 Fallback */}
        <Route
          path="*"
          element={
            <h2 style={{ textAlign: "center", marginTop: "50px" }}>
              404 - Page Not Found
            </h2>
          }
        />
      </Routes>
    </Router>
  );
};

export default App;
