# AK Converter: EmailJS Six-Digit Password Recovery

The Forgot Password page now emails a **six-digit verification code**, not a
reset link. The user enters their registered email and code on AK Converter.
After successful verification, they can create a new password. Unknown email
addresses receive the same response but are not sent any email.

## EmailJS: UPDATE THE SAVED TEMPLATE

The EmailJS service, template ID, public key and private key do not need to
change. **However, the existing "Reset My Password" button / {{reset_link}}
must be removed**. The backend now sends a code named {{reset_code}}, not
{{reset_link}}. With the old HTML, emails will not display a working code.

1. Open EmailJS > Email Templates > Password Reset > Edit Content > Code Editor.
2. Replace the body with the following HTML:

    <div style="max-width:560px;margin:20px auto;padding:28px;background:#fff;color:#243044;font-family:Arial,sans-serif;border:1px solid #e5eaf3;border-radius:12px">
      <h2 style="color:#1668e8">AK Converter</h2>
      <h1>Verify your email</h1>
      <p>Hello {{to_name}},</p>
      <p>Use this six-digit code to reset your AK Converter password:</p>
      <p style="padding:20px;text-align:center;background:#eef4ff;letter-spacing:8px;font-size:32px;font-weight:bold;color:#1668e8">{{reset_code}}</p>
      <p>This code expires in {{expires_minutes}} minutes and allows five attempts.</p>
      <p>Open AK Converter, enter this code and choose a new password.</p>
      <p>If you didn't request this, ignore this email.</p>
      <small style="color:#64748b">AK Converter Team</small>
    </div>

3. In the Content tab confirm the recipient field **To Email** is
   exactly {{to_email}}, the subject is "AK Converter verification code",
   and the sender name is "AK Converter". Save the template.
4. Keep your existing EmailJS Gmail service connection and the Security
   option for non-browser API requests enabled.

## Render backend environment variables

    EMAILJS_SERVICE_ID=service_...
    EMAILJS_TEMPLATE_ID=template_...
    EMAILJS_PUBLIC_KEY=...
    EMAILJS_PRIVATE_KEY=...

Only Render's **backend** requires these secrets. Do not add them to the Vite
frontend or to GitHub. The legacy PASSWORD_RESET_BASE_URL is no longer used
by the OTP flow and can be removed.

Redeploy the backend and frontend from main after merging the OTP change.
Both deployments are required. If the backend and frontend are deployed at
different times, verify that both use the same OTP API before testing.

## API

1. POST /api/auth/forgot-password   { "email": "member@example.com" }
   Returns a generic confirmation and emails {{reset_code}} only when the
   address exists and the per-account sending cooldown permits delivery.
2. POST /api/auth/verify-reset-code { "email": "member@example.com",
                                       "code": "001234" }
   Verifies the six-digit code and returns a short-lived, high-entropy
   resetToken for the current browser session.
3. POST /api/auth/reset-password    { "resetToken": "...",
                                       "password": "NewStrongPassword123" }
   Accepts only the one-time verified grant, changes the hashed password,
   and invalidates existing login sessions.

Codes are keyed-HMAC hashed in MongoDB, expire after 10 minutes, allow up
to five verification attempts, and can only be used once. Verification grants
expire after five minutes and are consumed on password change. A one-minute
per-account email cooldown and IP rate limits help prevent abuse.

## Test

Use a registered email address you own. From Login > Forgot password,
request a code and check the EmailJS history and your inbox. The code must
be visible in the message; there must be **no Reset Password link button**.
Enter the six digits on the website, set a new password, and verify login
succeeds with the new password, not the old one. Confirm a used code cannot
be used again. An unregistered address should receive no email.

For errors, inspect Render backend logs, but never log, screenshot or share
verification codes or EmailJS private keys.
