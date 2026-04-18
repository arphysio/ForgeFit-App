import { browserRedirectOrigin } from '@/lib/browserRedirectOrigin';
import { safeIntegrationReturnTo } from '@/lib/integrationReturnTo';
import { createState } from '@/lib/oauthState';
import { NextResponse } from 'next/server';

/**
 * WHOOP OAuth 2.0 — start authorization.
 * Env: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET (dashboard). Optional WHOOP_REDIRECT_URI, WHOOP_SCOPE.
 * @see https://developer.whoop.com/docs/developing/oauth/
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const publicOrigin = browserRedirectOrigin(req);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const clientId = process.env.WHOOP_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Missing WHOOP_CLIENT_ID in environment' }, { status: 500 });
  }

  const callback =
    process.env.WHOOP_REDIRECT_URI || `${publicOrigin}/api/integrations/whoop/callback`;
  const returnTo = safeIntegrationReturnTo(req.url, req);
  const state = createState({ provider: 'whoop', userId, returnTo });
  const scope = (process.env.WHOOP_SCOPE || 'offline read:recovery').trim();

  const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callback);
  authUrl.searchParams.set('scope', scope);
  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
