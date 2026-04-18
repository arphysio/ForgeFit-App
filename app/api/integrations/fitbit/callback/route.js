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
    return NextResponse.json({ error: 'Invalid Fitbit OAuth callback' }, { status: 400 });
  }

  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const callback =
    process.env.FITBIT_REDIRECT_URI || `${publicOrigin}/api/integrations/fitbit/callback`;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Missing FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET' },
      { status: 500 }
    );
  }

  const tokenUrl = 'https://api.fitbit.com/oauth2/token';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callback,
    client_id: clientId,
  });

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
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
      { error: payload?.errors?.[0]?.message || payload?.error || 'Fitbit token exchange failed' },
      { status: 502 }
    );
  }

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  await upsertDeviceToken({
    userId: parsed.userId,
    provider: 'fitbit',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    metadata: { scope: payload.scope ?? null, fitbit_user_id: payload.user_id ?? null },
  });

  return NextResponse.redirect(
    new URL(parsed.returnTo || '/forgefit-complete.html', publicOrigin)
  );
}
