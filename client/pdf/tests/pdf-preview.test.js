import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');

test('PDF preview is locally rendered with PDF.js rather than a browser PDF iframe', () => {
  const main = read('src/components/FileConverter.jsx');
  const component = read('src/components/PdfPreview.jsx');
  assert.match(main, /const PdfPreview = lazy\(/);
  assert.match(main, /<PdfPreview file=\{files\[0\]\}/);
  assert.doesNotMatch(main, /<iframe\b/);
  assert.match(component, /pdfjs-dist\/build\/pdf\.mjs/);
  assert.match(component, /pdf\.worker\.min\.mjs\?url/);
  assert.match(component, /file\.arrayBuffer\(\)/);
  assert.match(component, /page\.render\(/);
  assert.match(component, /Page \{pageNumber\} of \{pageCount\}/);
  assert.match(component, /loadingTask\.destroy\(\)/);
  assert.ok(existsSync(join(root, 'src/components/PdfPreview.jsx')));
});

test('pdfjs-dist dependency and complete lockfile metadata exist for Render npm ci', () => {
  const packageJson = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  const version = packageJson.dependencies['pdfjs-dist'];
  assert.equal(version, '5.4.530');
  assert.equal(lock.packages[''].dependencies['pdfjs-dist'], version);
  assert.equal(lock.packages['node_modules/pdfjs-dist'].version, version);
  assert.ok(lock.packages['node_modules/@napi-rs/canvas']);
});
