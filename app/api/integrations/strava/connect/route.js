import { browserRedirectOrigin } from '@/lib/browserRedirectOrigin';
import { safeIntegrationReturnTo } from '@/lib/integrationReturnTo';
import { createState } from '@/lib/oauthState';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const publicOrigin = browserRedirectOrigin(req);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

  const clientId = process.env.STRAVA_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Missing STRAVA_CLIENT_ID in environment' }, { status: 500 });
  }

  const callback =
    process.env.STRAVA_REDIRECT_URI || `${publicOrigin}/api/integrations/strava/callback`;
  const returnTo = safeIntegrationReturnTo(req.url, req);
  const state = createState({ provider: 'strava', userId, returnTo });
  const authUrl = new URL('https://www.strava.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', callback);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('approval_prompt', 'auto');
  authUrl.searchParams.set('scope', 'read,activity:write');

  authUrl.searchParams.set('state', state);

  return NextResponse.redirect(authUrl);
}
