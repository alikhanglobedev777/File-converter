import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(path) { return readFile(new URL(path, import.meta.url), 'utf8'); }

test('file dashboard is routed separately and all actions require bearer authentication', async () => {
  const [app, nav, dashboard] = await Promise.all([
    source('../src/App.jsx'),
    source('../src/components/Navbar.jsx'),
    source('../src/components/MyFiles.jsx'),
  ]);
  assert.match(app, /path="\/my-files"/);
  assert.match(app, /"\/my-files"/);
  assert.match(nav, /user && <NavLink to="\/my-files"/);
  assert.match(dashboard, /if \(!user \|\| !token\)/);
  assert.match(dashboard, /Authorization: 'Bearer ' \+ token/);
  assert.match(dashboard, /method: 'POST'/);
  assert.match(dashboard, /method: 'PATCH'/);
  assert.match(dashboard, /method: 'DELETE'/);
  assert.match(dashboard, /\/download/);
  assert.match(dashboard, /Permanently delete/);
});

test('guest invitation is once per session and offers register, login and dismiss', async () => {
  const popup = await source('../src/components/GuestDashboardInvite.jsx');
  const home = await source('../src/components/Home.jsx');
  assert.match(home, /<GuestDashboardInvite \/>/);
  assert.match(popup, /sessionStorage.getItem\(SEEN_KEY\)/);
  assert.match(popup, /sessionStorage.setItem\(SEEN_KEY, '1'\)/);
  assert.match(popup, /if \(user\) return undefined/);
  assert.match(popup, /role="dialog" aria-modal="true"/);
  assert.match(popup, /event.key === 'Escape'/);
  assert.match(popup, /Create free account/);
  assert.match(popup, /Maybe later/);
  assert.match(popup, /Conversions stay available without an account/);
});

test('latest small converted results may be saved voluntarily, not uploaded automatically', async () => {
  const converter = await source('../src/components/FileConverter.jsx');
  assert.match(converter, /setSaveCandidate\(\{ blob, filename \}\)/);
  assert.match(converter, /Save latest download to My Files/);
  assert.match(converter, /const saveConvertedResult = async/);
  assert.match(converter, /onClick=\{saveConvertedResult\}/);
  assert.match(converter, /!user \|\| !saveCandidate \|\| savingToVault/);
  const request = converter.slice(converter.indexOf('const saveConvertedResult = async'), converter.indexOf('  const actionLabel = actionLabels[service]'));
  assert.match(request, /fetch\(API_BASE_URL \+ '\/api\/files'/);
  assert.match(request, /method: 'POST'/);
  assert.doesNotMatch(converter.slice(converter.indexOf('const handleUpload'), converter.indexOf('const saveConvertedResult')), /fetch\(API_BASE_URL \+ '\/api\/files'/);
});

test('signup/login preserve safe dashboard redirect without open redirects', async () => {
  const [login, signup] = await Promise.all([
    source('../src/components/Login.jsx'), source('../src/components/Signup.jsx'),
  ]);
  assert.match(login, /location.state\?\.next === "\/my-files"/);
  assert.match(signup, /location.state\?\.next === "\/my-files"/);
});
