// server.js

require('dotenv').config(); // Load environment variables from .env
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

// Routes
const convertRoutes = require("./routes/convert-route");
const authRoutes = require("./routes/auth-route");

const app = express();

// ===== Middleware =====
app.use(cors());
app.use(express.json());

// ===== Ensure required folders exist =====
const ensureFolderExists = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Created folder: ${folderPath}`);
  }
};

ensureFolderExists(path.join(__dirname, "uploads"));
ensureFolderExists(path.join(__dirname, "outputs"));

// ===== MongoDB Connection =====
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("Error: MONGO_URI is undefined. Please check your .env file!");
  process.exit(1); // Stop server if URI is missing
}

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// ===== Routes =====
app.use("/api/convert", convertRoutes);
app.use("/api/auth", authRoutes);

// ===== Test Route =====
app.get("/test", (req, res) => res.send("Server is working"));

// ===== Start Server =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
