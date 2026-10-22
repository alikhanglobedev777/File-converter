const { randomBytes, createHash } = require('node:crypto');
const bcrypt = require('bcryptjs');
const User = require('../model/user');
const mail = require('../services/password-reset-mail');

const RESET_LIFETIME_MS = 10 * 60 * 1000;
const RESET_COOLDOWN_MS = 10 * 60 * 1000;
const GENERIC_RESPONSE = 'If that email is registered, a password reset link will be sent shortly.';

function normalizedEmail(value) {
  if (typeof value !== 'string') return null;
  const result = value.trim().toLowerCase();
  return result.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null;
}
function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createPasswordResetHandlers({
  UserModel = User,
  emailReady = () => !!mail.emailJsConfig(),
  sendEmail = mail.sendPasswordResetEmail,
  clock = () => Date.now(),
  logger = console,
} = {}) {
  const forgotPassword = async (req, res) => {
    const email = normalizedEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Enter a valid email address.' });
    try {
      // Never reveal whether an email exists, even if EmailJS is not configured.
      const user = await UserModel.findOne({ email }).select('+passwordResetRequestedAt');
      if (!user) return res.status(200).json({ message: GENERIC_RESPONSE });
      if (!emailReady()) {
        logger.error('Password reset email service is not configured');
        return res.status(200).json({ message: GENERIC_RESPONSE });
      }
      const now = clock();
      if (user.passwordResetRequestedAt &&
          now - new Date(user.passwordResetRequestedAt).getTime() < RESET_COOLDOWN_MS) {
        return res.status(200).json({ message: GENERIC_RESPONSE });
      }
      const token = randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      // Atomic cooldown: multiple requests cannot send concurrent reset links.
      const updated = await UserModel.updateOne({
        _id: user._id,
        $or: [
          { passwordResetRequestedAt: { $exists: false } },
          { passwordResetRequestedAt: { $lte: new Date(now - RESET_COOLDOWN_MS) } },
        ],
      }, { $set: {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: new Date(now + RESET_LIFETIME_MS),
        passwordResetRequestedAt: new Date(now),
      } });
      if (!updated.matchedCount) return res.status(200).json({ message: GENERIC_RESPONSE });
      try {
        await sendEmail({ toEmail: user.email, toName: user.name, token });
      } catch (error) {
        // Roll back only this request's token; never invalidate a newer one.
        await UserModel.updateOne({ _id: user._id, passwordResetTokenHash: tokenHash },
          { $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1,
            passwordResetRequestedAt: 1 } }).catch(() => {});
        logger.error('Password reset email delivery failed', { status: error?.status, name: error?.name });
      }
      return res.status(200).json({ message: GENERIC_RESPONSE });
    } catch (error) {
      logger.error('Password reset request failed', { name: error?.name });
      return res.status(503).json({ error: 'Password recovery is temporarily unavailable.' });
    }
  };

  const resetPassword = async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/i.test(token)) {
      return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return res.status(400).json({ error: 'Password must contain 8 to 128 characters.' });
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      // Hashes are compared inside MongoDB, never put the raw token in storage.
      // Updating the password and consuming the token are atomic: only one
      // concurrent attempt can succeed. Mongoose pre-save isn't called by
      // updateOne, so the new password is explicitly bcrypt-hashed above.
      const result = await UserModel.updateOne({
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: { $gt: new Date(clock()) },
      }, {
        $set: { password: hashedPassword },
        $unset: {
          passwordResetTokenHash: 1,
          passwordResetExpiresAt: 1,
          passwordResetRequestedAt: 1,
        },
        $inc: { tokenVersion: 1 },
      });
      if (!result.matchedCount) {
        return res.status(400).json({ error: 'This reset link is invalid or expired.' });
      }
      return res.json({ message: 'Your password was reset. Please log in.' });
    } catch (error) {
      logger.error('Password reset failed', { name: error?.name });
      return res.status(503).json({ error: 'Password recovery is temporarily unavailable.' });
    }
  };

  return { forgotPassword, resetPassword };
}

module.exports = { ...createPasswordResetHandlers(), createPasswordResetHandlers,
  hashToken, normalizedEmail, RESET_LIFETIME_MS, GENERIC_RESPONSE };
