# AK Converter: EmailJS Password Reset Setup

The Forgot password? link sends a single-use, 10-minute link from the Express
backend. Only existing registered MongoDB users are emailed. Unregistered
addresses receive the same confirmation response to prevent account enumeration.

## EmailJS / Gmail setup for Render Free

1. Sign in to https://dashboard.emailjs.com/ and connect a Gmail account
   under Email Services. Copy its Service ID.
2. Create an EmailJS email template. Set the recipient (To Email field) to
   {{to_email}} and use a body such as:
   Hello {{to_name}}, reset your AK Converter password here:
   {{reset_link}}
   This link expires in {{expires_minutes}} minutes. If you did not request
   this, ignore this message.
3. Copy the Template ID and your EmailJS Public Key and Private Key.
4. In EmailJS Account > Security, enable API calls from non-browser applications.
5. In the Render BACKEND service's Environment settings, set these five keys:

   EMAILJS_SERVICE_ID=service_...
   EMAILJS_TEMPLATE_ID=template_...
   EMAILJS_PUBLIC_KEY=...
   EMAILJS_PRIVATE_KEY=...
   PASSWORD_RESET_BASE_URL=https://ak-file-converter.onrender.com

6. Redeploy backend and frontend. NEVER add EmailJS private key to the frontend,
   a VITE_ variable, or GitHub.
7. Test with a registered email you own. The link will open a browser at
   /reset-password#token=... so the token is not included in HTTP requests.
   Confirm the new password works, the old one fails, and the link cannot
   be reused. Check that an unknown email gets the same on-screen response
   but causes no email delivery.

## Implementation details

POST /api/auth/forgot-password with JSON { "email": "member@example.com" }
POST /api/auth/reset-password with JSON { "token": "...", "password": "..." }

Render free does not support normal outgoing SMTP connections, but EmailJS
uses HTTPS and requires no custom domain when sending from connected Gmail.

The backend hashes tokens using SHA-256, stores expiration and cooldown
fields in MongoDB, and atomically replaces the bcrypt password while
consuming the token. It increases tokenVersion to revoke prior JWTs.
Requests are limited by IP and by a durable per-account 10-minute cooldown.

If EmailJS isn't configured, the recovery endpoint deliberately responds
generically to avoid revealing registered emails; server logs identify the
configuration issue. For production scale, prefer a transactional provider
and shared/distributed rate limiting.
