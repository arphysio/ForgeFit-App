import { browserRedirectOrigin } from '@/lib/browserRedirectOrigin';
import { upsertDeviceToken } from '@/lib/deviceTokens';
import { readState } from '@/lib/oauthState';
import { NextResponse } from 'next/server';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const publicOrigin = browserRedirectOrigin(req);
  const err = searchParams.get('error');
  const errDesc = searchParams.get('error_description');
  if (err) {
    return NextResponse.json(
      { error: errDesc || err, whoopQueryError: err },
      { status: 400 }
    );
  }

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const parsed = readState(state);

  if (!code || !parsed?.userId || parsed.provider !== 'whoop') {
    return NextResponse.json({ error: 'Invalid WHOOP OAuth callback' }, { status: 400 });
  }

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const callback =
    process.env.WHOOP_REDIRECT_URI || `${publicOrigin}/api/integrations/whoop/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Missing WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET' },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callback,
  });

  const response = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
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
      {
        error: payload?.message || payload?.error_description || payload?.error || 'WHOOP token exchange failed',
        details: payload ?? raw?.slice(0, 400),
      },
      { status: 502 }
    );
  }

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  await upsertDeviceToken({
    userId: parsed.userId,
    provider: 'whoop',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    metadata: { scope: payload.scope ?? null },
  });

  return NextResponse.redirect(
    new URL(parsed.returnTo || '/forgefit-complete.html', publicOrigin)
  );
}
