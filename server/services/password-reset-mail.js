// EmailJS REST API works over HTTPS on Render Free; no outbound SMTP ports.
// Keep all EmailJS identifiers and private keys on the backend only.
const EMAILJS_URL = 'https://api.emailjs.com/api/v1.0/email/send';

function emailJsConfig(env = process.env) {
  const serviceId = env.EMAILJS_SERVICE_ID?.trim();
  const templateId = env.EMAILJS_TEMPLATE_ID?.trim();
  const publicKey = env.EMAILJS_PUBLIC_KEY?.trim();
  const privateKey = env.EMAILJS_PRIVATE_KEY?.trim();
  return serviceId && templateId && publicKey && privateKey
    ? { serviceId, templateId, publicKey, privateKey } : null;
}

function passwordResetUrl(token, env = process.env) {
  // The origin must be trusted configuration, NOT the request's Host header.
  const origin = env.PASSWORD_RESET_BASE_URL?.trim();
  if (!origin) throw new Error('PASSWORD_RESET_BASE_URL is not configured');
  const base = new URL(origin);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(base.hostname))) {
    throw new Error('PASSWORD_RESET_BASE_URL must use HTTPS');
  }
  if (base.username || base.password || base.search || base.hash) {
    throw new Error('Invalid PASSWORD_RESET_BASE_URL');
  }
  return new URL('/reset-password?token=' + encodeURIComponent(token), base.origin).toString();
}

async function sendPasswordResetEmail({ toEmail, toName, token }, {
  env = process.env, fetchImpl = global.fetch,
} = {}) {
  const config = emailJsConfig(env);
  if (!config) throw new Error('EmailJS server credentials are not configured');
  const link = passwordResetUrl(token, env);
  const response = await fetchImpl(EMAILJS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      service_id: config.serviceId,
      template_id: config.templateId,
      user_id: config.publicKey,
      accessToken: config.privateKey,
      template_params: {
        to_email: toEmail,
        to_name: toName || 'there',
        reset_link: link,
        expires_minutes: '10',
        app_name: 'AK Converter',
      },
    }),
  });
  if (!response.ok) {
    // Do not include provider bodies or template parameters in logs. They
    // could contain the secret reset link.
    const error = new Error('EmailJS rejected the password reset email');
    error.status = response.status;
    throw error;
  }
}

module.exports = { emailJsConfig, passwordResetUrl, sendPasswordResetEmail };
