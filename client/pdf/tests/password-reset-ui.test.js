import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('forgot-password sends email and continues to OTP entry, not an emailed link', async () => {
  const source = await readFile(new URL('../src/components/ForgotPassword.jsx', import.meta.url), 'utf8');
  assert.match(source, /api\/auth\/forgot-password/);
  assert.match(source, /navigate\("\/reset-password",\s*\{\s*state:/);
  assert.match(source, /Send six-digit code/);
  assert.doesNotMatch(source, /Send reset link/);
});

test('reset-password verifies six digits before allowing a new password', async () => {
  const source = await readFile(new URL('../src/components/ResetPassword.jsx', import.meta.url), 'utf8');
  assert.match(source, /api\/auth\/verify-reset-code/);
  assert.match(source, /api\/auth\/reset-password/);
  assert.ok(source.includes('pattern="[0-9]{6}"'));
  assert.match(source, /setResetToken\(data\.resetToken\)/);
  assert.match(source, /\{resetToken && <form/);
  assert.doesNotMatch(source, /window\.location\.hash/);
});


test('unknown emails do not automatically navigate to OTP input or claim actual delivery', async () => {
  const source = await readFile(new URL('../src/components/ForgotPassword.jsx', import.meta.url), 'utf8');
  const requestHandler = source.slice(source.indexOf('const onSubmit = async'), source.indexOf('return <div className='));
  assert.match(requestHandler, /setStatusMessage\(data\.message/);
  assert.doesNotMatch(requestHandler, /navigate\("\/reset-password"/);
  assert.match(source, /onClick=\{\(\) => navigate\("\/reset-password"/);
  assert.match(source, /No email is sent for an unregistered address/);
  assert.match(source, /Use a different email address/);
});
