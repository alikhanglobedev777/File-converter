require("../config/env");
const mongoose = require("mongoose");
const { connectDatabase } = require("../config/database");

async function checkDatabase() {
  try {
    await connectDatabase();
    await mongoose.connection.db.command({ ping: 1 });
    console.log(`MongoDB connection and ping successful (database: ${mongoose.connection.name}).`);
  } catch {
    // Do not print driver errors, which may include connection details.
    console.error("Database check failed. Verify server/.env, Atlas credentials, network access, and cluster availability.");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

checkDatabase();
