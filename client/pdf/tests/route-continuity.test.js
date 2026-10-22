import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LAST_WORKSPACE_ROUTE_KEY,
  isKnownWorkspacePath,
  recoverWorkspacePath,
} from '../src/utils/routeContinuity.js';

const knownPaths = ['/', '/login', '/signup', '/history', '/pdf-to-excel', '/pdf-to-word'];

test('resumed index.html tab restores its last valid converter page', () => {
  assert.equal(recoverWorkspacePath('/pdf-to-excel', knownPaths), '/pdf-to-excel');
  assert.equal(recoverWorkspacePath('/pdf-to-word', knownPaths), '/pdf-to-word');
  assert.equal(recoverWorkspacePath('/history', knownPaths), '/history');
});

test('index.html fallback defaults to home for fresh or unavailable sessions', () => {
  assert.equal(recoverWorkspacePath(null, knownPaths), '/');
  assert.equal(recoverWorkspacePath('', knownPaths), '/');
  assert.equal(recoverWorkspacePath('/index.html', knownPaths), '/');
});

test('route restoration never trusts arbitrary redirect URLs or unknown paths', () => {
  for (const path of [
    'https://example.net/', '//example.net/', 'javascript:alert(1)',
    '/pdf-to-excel?token=secret', '/unknown-route', '/login/../../admin',
  ]) {
    assert.equal(recoverWorkspacePath(path, knownPaths), '/');
    assert.equal(isKnownWorkspacePath(path, knownPaths), false);
  }
});

test('route remembrance has a stable key and accepts the homepage', () => {
  assert.equal(LAST_WORKSPACE_ROUTE_KEY, 'ak-converter:last-workspace-route');
  assert.equal(isKnownWorkspacePath('/', knownPaths), true);
});
