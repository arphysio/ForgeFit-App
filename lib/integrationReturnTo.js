import { browserRedirectOrigin } from './browserRedirectOrigin';

/**
 * Same-origin return path for post-OAuth redirect (state payload).
 * Only allows paths under forgefit-complete.html to limit open redirects.
 *
 * @param {string} requestUrl - `req.url` from the connect handler
 * @param {Request|null} [req] - When set, same-origin checks use `browserRedirectOrigin(req)` so Host matches the browser (LAN IP vs localhost).
 */
export function safeIntegrationReturnTo(requestUrl, req = null, fallbackPath = '/forgefit-complete.html') {
  let urlObj;
  try {
    urlObj = new URL(requestUrl);
  } catch {
    return fallbackPath;
  }
  const allowedOrigin =
    req && typeof req === 'object' && 'headers' in req ? browserRedirectOrigin(req) : urlObj.origin;

  const rt = urlObj.searchParams.get('returnTo');
  if (!rt || typeof rt !== 'string' || rt.length > 2048) return fallbackPath;
  try {
    const resolved = new URL(rt, allowedOrigin);
    if (resolved.origin !== allowedOrigin) return fallbackPath;
    const path = resolved.pathname || '';
    if (!path.includes('forgefit-complete')) return fallbackPath;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallbackPath;
  }
}
