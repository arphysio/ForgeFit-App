import { browserRedirectOrigin } from '@/lib/browserRedirectOrigin';
import { upsertDeviceToken } from '@/lib/deviceTokens';
import { readState } from '@/lib/oauthState';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const publicOrigin = browserRedirectOrigin(req);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const parsed = readState(state);

  if (!code || !parsed?.userId) {
    return NextResponse.json({ error: 'Invalid Strava OAuth callback' }, { status: 400 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const callback =
    process.env.STRAVA_REDIRECT_URI || `${publicOrigin}/api/integrations/strava/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET' },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: callback,
  });

  const response = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.access_token) {
    return NextResponse.json(
      { error: payload?.message || payload?.error || 'Strava token exchange failed' },
      { status: 502 }
    );
  }

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  await upsertDeviceToken({
    userId: parsed.userId,
    provider: 'strava',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    metadata: { scope: payload.scope ?? null, athlete_id: payload.athlete?.id ?? null },
  });

  return NextResponse.redirect(
    new URL(parsed.returnTo || '/forgefit-complete.html', publicOrigin)
  );
}
