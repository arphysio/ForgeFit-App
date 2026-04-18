import { browserRedirectOrigin } from '@/lib/browserRedirectOrigin';
import { generateGarminPkcePair } from '@/lib/garminOAuthPkce';
import { safeIntegrationReturnTo } from '@/lib/integrationReturnTo';
import { createState } from '@/lib/oauthState';
import { NextResponse } from 'next/server';

/**
 * Garmin Connect Developer Program: OAuth 2.0 + PKCE (default).
 * Set GARMIN_OAUTH_USE_LEGACY=true only if Garmin gave you an older connectapi OAuth client.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const publicOrigin = browserRedirectOrigin(req);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const clientId = process.env.GARMIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Missing GARMIN_CLIENT_ID in environment' }, { status: 500 });
  }

  const callback =
    process.env.GARMIN_REDIRECT_URI || `${publicOrigin}/api/integrations/garmin/callback`;
  const returnTo = safeIntegrationReturnTo(req.url, req);

  const useLegacy = process.env.GARMIN_OAUTH_USE_LEGACY === 'true';

  if (useLegacy) {
    const state = createState({ provider: 'garmin', userId, returnTo, oauth: 'legacy' });
    const authUrl = new URL('https://connectapi.garmin.com/oauth-service/oauth/authorize');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', callback);
    authUrl.searchParams.set('scope', 'wellness:read workout:write');
    authUrl.searchParams.set('state', state);
    return NextResponse.redirect(authUrl);
  }

  const { codeVerifier, codeChallenge } = generateGarminPkcePair();
  const state = createState({
    provider: 'garmin',
    userId,
    returnTo,
    oauth: 'pkce',
    codeVerifier,
  });

  const authUrl = new URL('https://connect.garmin.com/oauth2Confirm');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callback);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
