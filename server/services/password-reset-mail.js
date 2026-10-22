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

async function sendPasswordResetEmail({ toEmail, toName, code }, {
  env = process.env, fetchImpl = global.fetch,
} = {}) {
  const config = emailJsConfig(env);
  if (!config) throw new Error('EmailJS server credentials are not configured');
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
        reset_code: code,
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

module.exports = { emailJsConfig, sendPasswordResetEmail };
