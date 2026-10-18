const path = require("path");

// Resolve from this file so `node server/server.js` also loads server/.env.
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });
