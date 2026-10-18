const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const { outputPath } = require('./output');

exports.makeZip = async files => {
  const filename = outputPath('zip');
  const output = fs.createWriteStream(filename);
  const archive = archiver('zip', { zlib: { level: 9 } });
  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', reject);
  });
  // Attach a handler immediately, including while finalize() is pending.
  done.catch(() => {});
  archive.pipe(output);
  const names = new Set();
  for (const file of files) {
    const base = path.basename(file.originalname.replace(/\\/g, '/'));
    let name = base, suffix = 2;
    while (names.has(name)) name = `${path.parse(base).name} (${suffix++})${path.extname(base)}`;
    names.add(name);
    archive.file(file.path, { name });
  }
  try {
    await Promise.all([archive.finalize(), done]);
    return filename;
  } catch (error) {
    archive.abort(); output.destroy();
    await new Promise(resolve => output.closed ? resolve() : output.once('close', resolve));
    await fs.promises.rm(filename, { force: true });
    throw error;
  }
};
