# AK Converter — Frontend

A white-and-blue, responsive file-conversion workspace built with React, React Router and Vite. It provides an overview dashboard, searchable-by-category tool cards, a shared upload workspace for nine conversion endpoints, and sign-in/sign-up pages. The original Express conversion API is unchanged.

## Run it

From the repository root:

```bash
cd server
cp .env.example .env
# Fill in the MongoDB and JWT settings in server/.env
npm ci
npm start
```

Then, in another terminal:

```bash
cd client/pdf
npm ci
npm run dev
```

Open the local URL Vite prints (normally `http://localhost:5173`). Run `npm run build`, `npm run lint` and `npm test` from `client/pdf` when dependencies are installed. The `npm test` checks verify tool configuration and the fixed case-sensitive CSS import without requiring the backend.

## Connecting to a backend

The UI sends requests to `http://localhost:5000` by default. To use a different backend origin, copy `.env.example` to `.env.local` and set:

```dotenv
VITE_API_URL=https://your-api-host.example
```

Do **not** include `/api` in that variable; the UI appends `/api/convert/:service` and `/api/auth/:action`. Restart Vite after updating the environment file. The API must allow the frontend origin through CORS. Do not put server secrets into `VITE_` variables.

## What's included

- Dashboard with nine tool cards, category filters, and workflow instructions.
- Shared uploader with drag-and-drop, file selection/removal, error/success feedback, and per-file 50 MB limits.
- PDF conversion to Excel, Word, PowerPoint, JPG; Excel conversion to PDF, Word, PowerPoint; PDF merging; ZIP creation.
- Account sign-in/sign-up screens. **Conversions don't require an account** in the existing backend.
- Responsive desktop sidebar/mobile drawer with accessible controls and consistent blue/white/black styling.

PDF-to-PowerPoint uses page images, not editable slide content. PDF-to-Excel and PDF-to-Word depend on extractable text; scans require OCR. The file size and count restrictions are enforced by the existing backend as well as surfaced in the UI. Backend availability is required for actual conversions and authentication.

## Render static-site routing (important)

This frontend uses React Router's `BrowserRouter`, so routes such as
`/pdf-to-excel` and `/history` must load the same Vite-built HTML shell.
For a **Render Static Site**, open **Redirects/Rewrites** and create this rule:

| Source | Destination | Action |
| --- | --- | --- |
| `/*` | `/index.html` | **Rewrite** (not Redirect) |

Use **Rewrite**, so the browser keeps the requested URL. A 301/302 redirect
changes the address to `/index.html`, which can happen during browser tab
restoration or reloading a converter route. Do not route `/api/*` into the
frontend if the API is served on the same origin.

The app also recognizes `/index.html` as a recovery alias: it returns to the
last known valid route in that browser tab, or to the workspace home if none is
recorded. This prevents the in-app not-found screen even if a host or browser
lands on `/index.html`; the hosting Rewrite rule is still the preferred fix.
