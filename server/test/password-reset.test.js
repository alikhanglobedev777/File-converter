const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createPasswordResetHandlers, hashToken, GENERIC_RESPONSE } =
  require('../controller/password-reset-controller');
const { emailJsConfig, passwordResetUrl, sendPasswordResetEmail } =
  require('../services/password-reset-mail');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function makeFixture() {
  const user = {
    _id: 'registered-user', name: 'Registered User', email: 'member@example.com',
    password: '$2b$12$old', tokenVersion: 0,
  };
  let sent = [];
  const UserModel = {
    findOne({ email }) {
      return { select: async () => email === user.email ? { ...user } : null };
    },
    async updateOne(query, changes) {
      if (query.passwordResetTokenHash && query.passwordResetExpiresAt) {
        if (user.passwordResetTokenHash !== query.passwordResetTokenHash ||
            !(user.passwordResetExpiresAt > query.passwordResetExpiresAt.$gt)) {
          return { matchedCount: 0 };
        }
      } else if (query.passwordResetTokenHash) {
        if (user.passwordResetTokenHash !== query.passwordResetTokenHash) return { matchedCount: 0 };
      } else if (query.$or) {
        const cooldown = query.$or[1].passwordResetRequestedAt.$lte;
        if (user.passwordResetRequestedAt && user.passwordResetRequestedAt > cooldown) {
          return { matchedCount: 0 };
        }
      }
      for (const [field, value] of Object.entries(changes.$set || {})) user[field] = value;
      for (const field of Object.keys(changes.$unset || {})) delete user[field];
      for (const [field, value] of Object.entries(changes.$inc || {})) {
        user[field] = (user[field] || 0) + value;
      }
      return { matchedCount: 1 };
    },
  };
  let time = Date.now();
  const handlers = createPasswordResetHandlers({
    UserModel, emailReady: () => true, clock: () => time,
    sendEmail: async (payload) => { sent.push(payload); }, logger: { error() {} },
  });
  return {
    user, handlers,
    sent: () => sent,
    advance: milliseconds => { time += milliseconds; },
  };
}

test('unknown or mixed-case addresses never expose account existence', async () => {
  const f = makeFixture();
  const unknown = response(), registered = response();
  await f.handlers.forgotPassword({ body: { email: 'absent@example.com' } }, unknown);
  await f.handlers.forgotPassword({ body: { email: 'MEMBER@example.com' } }, registered);
  assert.equal(unknown.statusCode, 200);
  assert.equal(registered.statusCode, 200);
  assert.equal(unknown.body.message, GENERIC_RESPONSE);
  assert.equal(registered.body.message, GENERIC_RESPONSE);
  assert.equal(f.sent().length, 1);
  assert.equal(f.sent()[0].toEmail, 'member@example.com');
});

test('registered-user reset token is hashed, expires and cannot be reused', async () => {
  const f = makeFixture();
  await f.handlers.forgotPassword({ body: { email: f.user.email } }, response());
  assert.equal(f.sent().length, 1);
  const token = f.sent()[0].token;
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(f.user.passwordResetTokenHash, hashToken(token));
  assert.notEqual(f.user.passwordResetTokenHash, token);
  const reset = response();
  await f.handlers.resetPassword({ body: { token, password: 'NewVeryStrongPassword123' } }, reset);
  assert.equal(reset.statusCode, 200);
  assert.equal(await bcrypt.compare('NewVeryStrongPassword123', f.user.password), true);
  assert.equal(f.user.passwordResetTokenHash, undefined);
  assert.equal(f.user.tokenVersion, 1, 'old JWTs must be revoked');
  const replay = response();
  await f.handlers.resetPassword({ body: { token, password: 'AnotherStrongPassword' } }, replay);
  assert.equal(replay.statusCode, 400);
});

test('registered-user cooldown prevents repeated emails', async () => {
  const f = makeFixture();
  await f.handlers.forgotPassword({ body: { email: f.user.email } }, response());
  await f.handlers.forgotPassword({ body: { email: f.user.email } }, response());
  assert.equal(f.sent().length, 1);
  f.advance(10 * 60 * 1000 + 10);
  await f.handlers.forgotPassword({ body: { email: f.user.email } }, response());
  assert.equal(f.sent().length, 2);
});

test('reset links expire and weak passwords cannot be accepted', async () => {
  const f = makeFixture();
  await f.handlers.forgotPassword({ body: { email: f.user.email } }, response());
  const token = f.sent()[0].token;
  const weak = response();
  await f.handlers.resetPassword({ body: { token, password: '1234567' } }, weak);
  assert.equal(weak.statusCode, 400);
  f.advance(10 * 60 * 1000 + 1);
  const expired = response();
  await f.handlers.resetPassword({ body: { token, password: 'StrongEnoughPassword123' } }, expired);
  assert.equal(expired.statusCode, 400);
  assert.equal(f.user.tokenVersion, 0);
});

test('EmailJS HTTPS request is server-side, requires private key and never exposes it in reset URL', async () => {
  const env = {
    EMAILJS_SERVICE_ID: 'service_test', EMAILJS_TEMPLATE_ID: 'template_test',
    EMAILJS_PUBLIC_KEY: 'public_test', EMAILJS_PRIVATE_KEY: 'secret_private',
    PASSWORD_RESET_BASE_URL: 'https://ak-file-converter.onrender.com',
  };
  assert.equal(emailJsConfig(env).privateKey, 'secret_private');
  assert.equal(emailJsConfig({ EMAILJS_SERVICE_ID: 'x' }), null);
  let sent;
  await sendPasswordResetEmail({
    toEmail: 'member@example.com', toName: 'Member', token: 'a'.repeat(64),
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
  assert.ok(sent.body.template_params.reset_link.includes('#token=' + 'a'.repeat(64)));
  assert.equal(new URL(sent.body.template_params.reset_link).search, '');
  assert.throws(() => passwordResetUrl('a'.repeat(64), {
    PASSWORD_RESET_BASE_URL: 'http://evil.example',
  }), /HTTPS/);
});

test('failed EmailJS deliveries revoke the pending token and still do not expose registration', async () => {
  const f = makeFixture();
  const broken = createPasswordResetHandlers({
    UserModel: {
      findOne: ({ email }) => ({ select: async () => email === f.user.email ? f.user : null }),
      updateOne: async (q, u) => {
        if (u.$set) {
          Object.assign(f.user, u.$set);
          return { matchedCount: 1 };
        }
        for (const key of Object.keys(u.$unset || {})) delete f.user[key];
        return { matchedCount: 1 };
      },
    },
    emailReady: () => true,
    sendEmail: async () => { throw new Error('Provider refused email'); },
    logger: { error() {} },
  });
  const res = response();
  await broken.forgotPassword({ body: { email: f.user.email } }, res);
  assert.equal(res.body.message, GENERIC_RESPONSE);
  assert.equal(f.user.passwordResetTokenHash, undefined);
});
