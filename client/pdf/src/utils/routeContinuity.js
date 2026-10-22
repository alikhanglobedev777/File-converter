// The hosting layer can serve the SPA fallback as /index.html after the browser
// restores a discarded tab. Keep only known client-side paths; never store
// uploads, query strings, auth tokens, or an arbitrary redirect target.
export const LAST_WORKSPACE_ROUTE_KEY = 'ak-converter:last-workspace-route';

export function isKnownWorkspacePath(pathname, knownPaths) {
  return typeof pathname === 'string' && knownPaths.includes(pathname);
}

export function recoverWorkspacePath(savedPath, knownPaths) {
  return isKnownWorkspacePath(savedPath, knownPaths) ? savedPath : '/';
}
