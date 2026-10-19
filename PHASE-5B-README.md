# AK Converter — Phase 5B: Private Conversion History

Apply **after Phase 5A (Visual PDF Organizer)**. This patch updates both `server/` and `client/pdf/`.

## Functionality

- Logged-in conversions (all 13 conversion endpoints) record **metadata only** in MongoDB collection `conversionhistories`: account ID, sanitized first filename, tool, result extension, success/failure, size, file count, and timestamp.
- Guest conversions are not tracked. Previous conversions are **not** backfilled.
- `/history` is a private My History interface accessible in the sidebar after login: pagination, counts, delete one, clear all.
- `GET /api/history?page=1`, `DELETE /api/history/:id`, and `DELETE /api/history` require a valid JWT. Every query/deletion is scoped to the token's account.
- MongoDB TTL index on `expiresAt` (30 days by default). Expiry is asynchronous. Setting `HISTORY_RETENTION_DAYS` affects only newly created records; it does not retroactively change old expiry timestamps.
- Input files and output files are never stored in the history database. History **cannot** re-download old conversions. Existing conversion temporary files are removed by conversion logic.
- Failure to write history is logged without breaking an otherwise successful download.

## Environment

Optional new **backend** variable in Render → Backend service → Environment:

`HISTORY_RETENTION_DAYS=30`

Default is 30 even if omitted. Valid values: integer from 1 through 365; invalid values revert to 30. Keep `MONGO_URI`, `MONGO_DB_NAME`, `JWT_SECRET`, and `CORS_ORIGIN` unchanged (make sure `CORS_ORIGIN` matches your exact frontend URL). The backend CORS methods now include `DELETE` for history controls.

Your existing MongoDB database is reused. Mongoose automatically attempts to create the necessary indexes on application startup, assuming the Atlas database user has index-creation permissions. Review Atlas indexes if your Atlas user is restricted.

## Local test commands

```powershell
cd "C:\Users\ak821\Desktop\File-converter\server"
npm ci
npm test
cd ..\client\pdf
npm ci
npm test
npm run build
```

`npm test` does **not** connect to your Atlas database; it uses mocked data. For live verification, sign in, convert a small PDF successfully, then open My History and inspect the `conversionhistories` collection in Atlas. Test individual deletion, clear all, and guest conversion (log out). Log in with a second account and verify histories are isolated. History saved after backend deploy; older conversions will not appear.

## Production rollout

1. Apply patch on your existing development branch, already containing Phase 5A, then run `git apply --check`.
2. Test both server and frontend locally and commit/push to GitHub.
3. Merge or deploy to `main` as configured in Render; wait until **backend** and **frontend** services are Live. Ideally deploy backend before frontend to avoid temporary `404` from `/api/history`.
4. Add the optional `HISTORY_RETENTION_DAYS=30` backend variable if you want it explicit; Render will redeploy on save. No new frontend env vars or services are needed.
5. Visit `https://ak-file-converter.onrender.com/history` after logging in.

## Caveats

History is metadata only; filenames may be sensitive, so do not share screenshots of your Atlas data without redacting information. Failed uploads rejected before the conversion handler (e.g. invalid file extension, rate limit) are not recorded. History records describe server-side conversion/download outcome, not whether the user later kept or opened the downloaded file.
