// server.js

require("./config/env");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const { connectDatabase } = require("./config/database");

// Routes
const convertRoutes = require("./routes/convert-route");
const authRoutes = require("./routes/auth-route");
const historyRoutes = require("./routes/history-route");
const { router: userFilesRoutes } = require("./routes/user-files-route");
const { router: ocrRoutes } = require("./routes/ocr-route");

const app = express();

// ===== Middleware =====
const allowedOrigin = process.env.CORS_ORIGIN?.trim();
app.use(cors({
  origin: allowedOrigin ? [allowedOrigin] : true,
  methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  exposedHeaders: ['Content-Disposition'],
}));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-site',
  });
  next();
});
app.use(express.json({ limit: '1mb' }));

// ===== Ensure required folders exist =====
const ensureFolderExists = (folderPath) => {
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
    console.log(`Created folder: ${folderPath}`);
  }
};

ensureFolderExists(path.join(__dirname, "uploads"));
ensureFolderExists(path.join(__dirname, "outputs"));

// ===== Routes =====
app.use("/api/convert", convertRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/files", userFilesRoutes);
app.use("/api/ocr", ocrRoutes);

// ===== Test Route =====
app.get("/test", (req, res) => res.send("Server is working"));
app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    status: connected ? "ok" : "unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

// ===== Start Server =====
async function startServer() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-with-")) {
    throw new Error("Set JWT_SECRET in server/.env to a random secret of at least 32 characters.");
  }
  await connectDatabase();
  console.log("MongoDB connected successfully");
  const port = process.env.PORT || 5000;
  return app.listen(port, () => console.log(`Server running on port ${port}`));
}

if (require.main === module) {
  startServer().catch(async (err) => {
    console.error(err.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };
