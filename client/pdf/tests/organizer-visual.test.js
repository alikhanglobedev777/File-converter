import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VISUAL_PAGE_LIMIT, normalizeRotation, createPagePlan, movePage, removePage, rotatePage, serializePlan } from '../src/utils/organizerPlan.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path) => readFileSync(join(root, path), 'utf8');

test('all PDF pages are included in the initial plan', () => {
  assert.deepEqual(serializePlan(createPagePlan(4)), { pages: '1,2,3,4', rotate: '' });
  assert.equal(VISUAL_PAGE_LIMIT, 60);
});

test('reordering and deleting pages serialize to the existing backend contract', () => {
  const initial = createPagePlan(4);
  const moved = movePage(initial, 2, 0);
  assert.equal(serializePlan(moved).pages, '3,1,2,4');
  assert.equal(serializePlan(removePage(moved, 2)).pages, '3,1,4');
  assert.deepEqual(serializePlan(initial), { pages: '1,2,3,4', rotate: '' });
});

test('cannot remove the last page and invalid moves preserve the plan', () => {
  const initial = createPagePlan(1);
  assert.equal(removePage(initial, 1), initial);
  assert.equal(movePage(initial, 0, 3), initial);
});

test('clockwise rotations are sent as absolute angles, even for pre-rotated PDFs', () => {
  const initial = createPagePlan(3, [0, 90, 270]);
  const first = rotatePage(initial, 2);
  assert.deepEqual(serializePlan(first), { pages: '1,2,3', rotate: '2:180' });
  const next = rotatePage(first, 3);
  assert.deepEqual(serializePlan(next), { pages: '1,2,3', rotate: '2:180,3:0' });
  assert.equal(normalizeRotation(360), 0);
  assert.equal(normalizeRotation(-90), 270);
});

test('visual PDF editor renders thumbnails and connects to the existing organizer route', () => {
  const component = source('src/components/VisualPdfOrganizer.jsx');
  const converter = source('src/components/FileConverter.jsx');
  assert.match(component, /pdfjs-dist\/build\/pdf\.mjs/);
  assert.match(component, /pdf\.worker\.min\.mjs\?url/);
  assert.match(component, /file\.arrayBuffer\(\)/);
  assert.match(component, /onPlanChange\(serializePlan/);
  assert.match(component, /FiRotateCw/);
  assert.match(component, /onDrop=/);
  assert.match(converter, /<VisualPdfOrganizer/);
  assert.match(converter, /organizerEditorReady/);
  assert.match(converter, /formData\.append\("pages", organizerPages\.trim\(\)\)/);
  assert.match(converter, /formData\.append\("rotate", organizerRotate\.trim\(\)\)/);
});
