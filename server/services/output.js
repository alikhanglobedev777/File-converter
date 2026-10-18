const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function outputPath(extension) {
  const directory = path.join(__dirname, '../outputs');
  fs.mkdirSync(directory, { recursive: true });
  return path.join(directory, `${randomUUID()}.${extension}`);
}

// Files created by a failed conversion must not be left in outputs/.
async function writeOutput(extension, writer) {
  const filename = outputPath(extension);
  try {
    await writer(filename);
    return filename;
  } catch (error) {
    await fs.promises.rm(filename, { force: true }).catch(() => {});
    throw error;
  }
}

module.exports = { outputPath, writeOutput };
