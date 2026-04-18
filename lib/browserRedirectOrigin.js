/**
 * Origin for redirects and default OAuth callback URLs in the user's browser.
 *
 * 1) When Next binds `0.0.0.0`, `new URL(req.url).origin` can be `http://0.0.0.0:3000`
 *    — invalid in Safari ("restricted network portal").
 * 2) Forcing `localhost` breaks phones/tablets: after Strava they land on the phone's
 *    localhost → "can't find server". Prefer the `Host` header the client actually used
 *    (e.g. `192.168.1.10:3000`) plus `X-Forwarded-*` when behind a proxy.
 *
 * Set FORGEFIT_APP_ORIGIN or NEXT_PUBLIC_APP_URL for production (public https URL).
 *
 * @param {Request|string} reqOrUrl - Next.js `Request` (recommended) or URL string fallback
 */
function isUnusableRedirectHost(hostname) {
  const h = (hostname || '').replace(/^\[|\]$/g, '');
  return h === '0.0.0.0' || h === '::' || h === '';
}

export function browserRedirectOrigin(reqOrUrl) {
  const explicit = (process.env.FORGEFIT_APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* ignore */
    }
  }

  const request =
    typeof reqOrUrl === 'object' && reqOrUrl !== null && 'headers' in reqOrUrl ? reqOrUrl : null;
  const url = new URL(request ? request.url : reqOrUrl);

  if (request) {
    const xfHost = request.headers.get('x-forwarded-host');
    const hostHeader = request.headers.get('host');
    const xfProto = request.headers.get('x-forwarded-proto');
    const pickHost = (xfHost || hostHeader || '').split(',')[0].trim();
    const hostOnly = pickHost.includes('[') ? pickHost.split(']')[0].slice(1) : pickHost.split(':')[0];
    if (pickHost && !isUnusableRedirectHost(hostOnly)) {
      const protoPart = (xfProto || '').split(',')[0].trim();
      const proto =
        protoPart === 'http' || protoPart === 'https'
          ? protoPart
          : url.protocol === 'https:'
            ? 'https'
            : 'http';
      return `${proto}://${pickHost}`;
    }
  }

  let host = url.hostname;
  if (isUnusableRedirectHost(host)) {
    host = 'localhost';
  }
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${host}${port}`;
}
