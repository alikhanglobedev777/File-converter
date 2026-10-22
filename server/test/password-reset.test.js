const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const {
  createPasswordResetHandlers, hashToken, hashCode, newSixDigitCode,
  GENERIC_RESPONSE, MAX_CODE_ATTEMPTS, RESET_LIFETIME_MS, RESET_COOLDOWN_MS,
} = require('../controller/password-reset-controller');
const { emailJsConfig, sendPasswordResetEmail } = require('../services/password-reset-mail');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function matching(query, user) {
  if (query._id && query._id !== user._id) return false;
  if (query.email && query.email !== user.email) return false;
  for (const field of ['passwordResetCodeHash', 'passwordResetVerifiedTokenHash']) {
    const expected = query[field];
    if (!expected) continue;
    if (expected.$exists && !Object.hasOwn(user, field)) return false;
    if (typeof expected === 'string' && user[field] !== expected) return false;
  }
  for (const field of ['passwordResetExpiresAt', 'passwordResetVerifiedExpiresAt']) {
    const expected = query[field];
    if (expected && !(user[field] > expected.$gt)) return false;
  }
  if (query.passwordResetAttempts &&
      !(user.passwordResetAttempts < query.passwordResetAttempts.$lt)) return false;
  if (query.$or && !query.$or.some(part =>
    part.passwordResetRequestedAt?.$exists === false ?
      !Object.hasOwn(user, 'passwordResetRequestedAt') :
      user.passwordResetRequestedAt <= part.passwordResetRequestedAt?.$lte)) return false;
  return true;
}

function makeFixture({ mailReady = true, rejectMail = false } = {}) {
  const user = { _id: 'registered-user', name: 'Registered User',
    email: 'member@example.com', password: '$2b$12$old', tokenVersion: 0 };
  const sent = [];
  let time = Date.now();
  const UserModel = {
    findOne({ email }) {
      return { select: async () => email === user.email ? { ...user } : null };
    },
    async updateOne(query, changes) {
      if (!matching(query, user)) return { matchedCount: 0 };
      for (const [field, value] of Object.entries(changes.$set || {})) user[field] = value;
      for (const field of Object.keys(changes.$unset || {})) delete user[field];
      for (const [field, value] of Object.entries(changes.$inc || {})) {
        user[field] = (user[field] || 0) + value;
      }
      return { matchedCount: 1 };
    },
  };
  const handlers = createPasswordResetHandlers({
    UserModel, emailReady: () => mailReady, clock: () => time,
    hashCodeForUser: (email, code) => hashCode(email, code, 'test-secret-'.repeat(4)),
    sendEmail: async payload => {
      if (rejectMail) throw new Error('mail rejected');
      sent.push(payload);
    },
    logger: { error() {} },
  });
  return { user, handlers, sent, advance: ms => { time += ms; } };
}
async function request(f, email = 'member@example.com') {
  const res = response();
  await f.handlers.forgotPassword({ body: { email } }, res);
  return res;
}
async function verify(f, code, email = 'member@example.com') {
  const res = response();
  await f.handlers.verifyResetCode({ body: { email, code } }, res);
  return res;
}
async function reset(f, resetToken, password = 'NewVeryStrongPassword123') {
  const res = response();
  await f.handlers.resetPassword({ body: { resetToken, password } }, res);
  return res;
}

test('six-digit codes include leading zeros and are always six decimal digits', () => {
  for (let i = 0; i < 100; i++) assert.match(newSixDigitCode(), /^[0-9]{6}$/);
});

test('only registered users are emailed; unknown and known get identical public responses', async () => {
  const f = makeFixture();
  const unknown = await request(f, 'absent@example.com');
  const registered = await request(f, 'MEMBER@example.com');
  assert.equal(unknown.statusCode, 200);
  assert.equal(registered.statusCode, 200);
  assert.equal(unknown.body.message, GENERIC_RESPONSE);
  assert.equal(registered.body.message, GENERIC_RESPONSE);
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].toEmail, f.user.email);
  assert.match(f.sent[0].code, /^[0-9]{6}$/);
  assert.equal(f.sent[0].token, undefined);
});

test('code is HMAC-hashed in database, correct code verifies, new password is editable only afterward', async () => {
  const f = makeFixture();
  await request(f);
  const code = f.sent[0].code;
  assert.equal(f.user.passwordResetCodeHash,
    hashCode(f.user.email, code, 'test-secret-'.repeat(4)));
  assert.notEqual(f.user.passwordResetCodeHash, code);
  assert.equal(f.user.passwordResetVerifiedTokenHash, undefined);
  const verified = await verify(f, code);
  assert.equal(verified.statusCode, 200);
  assert.match(verified.body.resetToken, /^[0-9a-f]{64}$/);
  assert.equal(f.user.passwordResetCodeHash, undefined);
  assert.equal(f.user.passwordResetVerifiedTokenHash, hashToken(verified.body.resetToken));
  const result = await reset(f, verified.body.resetToken);
  assert.equal(result.statusCode, 200);
  assert.equal(await bcrypt.compare('NewVeryStrongPassword123', f.user.password), true);
  assert.equal(f.user.tokenVersion, 1);
  assert.equal(f.user.passwordResetVerifiedTokenHash, undefined);
  assert.equal((await reset(f, verified.body.resetToken)).statusCode, 400,
    'verification grant must be single-use');
  assert.equal((await verify(f, code)).statusCode, 400,
    'the consumed six-digit code must not be reused');
});

test('five incorrect six-digit guesses exhaust the code even when the correct code is entered later', async () => {
  const f = makeFixture();
  await request(f);
  const correct = f.sent[0].code;
  const wrong = correct === '000000' ? '000001' : '000000';
  for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
    const result = await verify(f, wrong);
    assert.equal(result.statusCode, 400);
  }
  assert.equal(f.user.passwordResetAttempts, MAX_CODE_ATTEMPTS);
  assert.equal((await verify(f, correct)).statusCode, 400);
});

test('expired code and expired verification grant are rejected', async () => {
  const f = makeFixture();
  await request(f);
  f.advance(RESET_LIFETIME_MS + 1);
  assert.equal((await verify(f, f.sent[0].code)).statusCode, 400);
  f.advance(RESET_COOLDOWN_MS);
  await request(f);
  const granted = await verify(f, f.sent[1].code);
  assert.equal(granted.statusCode, 200);
  f.advance(5 * 60 * 1000 + 1);
  assert.equal((await reset(f, granted.body.resetToken)).statusCode, 400);
  assert.equal(f.user.tokenVersion, 0);
});

test('per-account email cooldown persists and failures release cooldown for retry', async () => {
  const f = makeFixture();
  await request(f);
  await request(f);
  assert.equal(f.sent.length, 1);
  f.advance(RESET_COOLDOWN_MS + 1);
  await request(f);
  assert.equal(f.sent.length, 2);
  const failed = makeFixture({ rejectMail: true });
  assert.equal((await request(failed)).body.message, GENERIC_RESPONSE);
  assert.equal(failed.user.passwordResetCodeHash, undefined);
  assert.equal(failed.user.passwordResetRequestedAt, undefined);
});

test('unknown email and unconfigured EmailJS never send, both respond generically', async () => {
  const f = makeFixture({ mailReady: false });
  assert.equal((await request(f)).body.message, GENERIC_RESPONSE);
  assert.equal(f.sent.length, 0);
});

test('EmailJS sends six-digit code, not a reset link or sensitive URL', async () => {
  const env = {
    EMAILJS_SERVICE_ID: 'service_test', EMAILJS_TEMPLATE_ID: 'template_test',
    EMAILJS_PUBLIC_KEY: 'public_test', EMAILJS_PRIVATE_KEY: 'secret_private',
  };
  assert.equal(emailJsConfig(env).privateKey, 'secret_private');
  let sent;
  await sendPasswordResetEmail({
    toEmail: 'member@example.com', toName: 'Member', code: '001234',
  }, {
    env,
    fetchImpl: async (url, options) => {
      sent = { url, options, body: JSON.parse(options.body) };
      return { ok: true, status: 200 };
    },
  });
  assert.equal(sent.url, 'https://api.emailjs.com/api/v1.0/email/send');
  assert.equal(sent.body.accessToken, 'secret_private');
  assert.equal(sent.body.template_params.to_email, 'member@example.com');
  assert.equal(sent.body.template_params.reset_code, '001234');
  assert.equal(sent.body.template_params.reset_link, undefined);
  assert.equal(sent.body.template_params.expires_minutes, '10');
});


test('nonexistent MongoDB email never issues a code or calls EmailJS', async () => {
  let updates = 0, deliveries = 0;
  const handlers = createPasswordResetHandlers({
    UserModel: {
      findOne({ email }) {
        assert.equal(email, 'notregistered@example.com');
        return { select: async () => null };
      },
      async updateOne() { updates++; throw new Error('Should not issue a code'); },
    },
    emailReady: () => true,
    sendEmail: async () => { deliveries++; throw new Error('Should not send'); },
    logger: { error() {} },
  });
  const res = response();
  await handlers.forgotPassword({ body: { email: 'NotRegistered@Example.com' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, GENERIC_RESPONSE);
  assert.equal(updates, 0);
  assert.equal(deliveries, 0);
});

test('account removed or email changed before atomic issue receives no email', async () => {
  let deliveries = 0;
  const handlers = createPasswordResetHandlers({
    UserModel: {
      findOne: () => ({ select: async () => ({
        _id: 'id-123', email: 'old@example.com', name: 'Someone',
      }) }),
      async updateOne(query) {
        assert.equal(query._id, 'id-123');
        assert.equal(query.email, 'old@example.com');
        return { matchedCount: 0 };
      },
    },
    emailReady: () => true,
    sendEmail: async () => { deliveries++; },
    hashCodeForUser: (email, code) => hashCode(email, code, 'test-secret-'.repeat(4)),
    logger: { error() {} },
  });
  const res = response();
  await handlers.forgotPassword({ body: { email: 'old@example.com' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.message, GENERIC_RESPONSE);
  assert.equal(deliveries, 0);
});
