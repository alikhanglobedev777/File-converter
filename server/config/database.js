const mongoose = require("mongoose");

async function connectDatabase(env = process.env) {
  const uri = env.MONGO_URI?.trim();
  if (!uri || /[<>]/.test(uri)) {
    throw new Error("Set MONGO_URI in server/.env to your Atlas connection string and replace all <placeholders>.");
  }
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) {
    throw new Error("MONGO_URI must start with mongodb+srv:// or mongodb://.");
  }

  try {
    await mongoose.connect(uri, {
      dbName: env.MONGO_DB_NAME?.trim() || "file_converter",
      serverSelectionTimeoutMS: 10000,
    });
  } catch {
    // Driver errors may contain credentials or connection details.
    throw new Error("MongoDB connection failed. Check your Atlas URI, database user/password, IP access list, and cluster availability.");
  }
}

module.exports = { connectDatabase };
