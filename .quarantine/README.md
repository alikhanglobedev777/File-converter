# Unexpected script found during setup

`fa-solid-900.woff2.txt` was originally located at
`client/pdf/src/components/public/fonts/fa-solid-900.woff2`. Its contents begin
with JavaScript (`global['!']`) rather than a WOFF2 font header. It contains
obfuscated code and has been moved here as text for inspection. Do not execute it.
No source references to the original font path were found.

The existing `client/pdf/vite.config.js` also contained obfuscated JavaScript and
failed to parse. It was replaced with the standard React/Vite configuration.
This observation is not a full security audit of the repository or dependencies.
