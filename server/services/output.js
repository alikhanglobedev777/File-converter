const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function outputPath(extension) {
  const directory = path.join(__dirname, '../outputs');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, `${randomUUID()}.${extension}`);
}

module.exports = { outputPath };
