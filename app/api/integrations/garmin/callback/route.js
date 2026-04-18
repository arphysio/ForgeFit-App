import { browserRedirectOrigin } from '@/lib/browserRedirectOrigin';
import { upsertDeviceToken } from '@/lib/deviceTokens';
import { readState } from '@/lib/oauthState';
import { NextResponse } from 'next/server';

function garminTokenErrorResponse(payload, raw, status) {
  const msg =
    payload?.clientMessage ||
    payload?.message ||
    payload?.error_description ||
    payload?.error ||
    (typeof raw === 'string' ? raw.slice(0, 400) : null) ||
    'Garmin token exchange failed';
  return NextResponse.json(
    {
      error: msg,
      errorId: payload?.errorId,
      garminError: payload?.error,
      details: payload ?? null,
    },
    { status: status || 502 }
  );
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const publicOrigin = browserRedirectOrigin(req);
  const oauthErr = searchParams.get('error');
  const oauthErrDesc = searchParams.get('error_description');
  if (oauthErr) {
    return NextResponse.json(
      {
        error: oauthErrDesc || oauthErr,
        garminQueryError: oauthErr,
      },
      { status: 400 }
    );
  }
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const parsed = readState(state);

  if (!code || !parsed?.userId) {
    return NextResponse.json({ error: 'Invalid Garmin OAuth callback' }, { status: 400 });
  }

  const clientId = process.env.GARMIN_CLIENT_ID;
  const clientSecret = process.env.GARMIN_CLIENT_SECRET;
  const callback =
    process.env.GARMIN_REDIRECT_URI || `${publicOrigin}/api/integrations/garmin/callback`;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'Missing GARMIN_CLIENT_ID / GARMIN_CLIENT_SECRET' },
      { status: 500 }
    );
  }

  const useLegacy =
    process.env.GARMIN_OAUTH_USE_LEGACY === 'true' || parsed.oauth === 'legacy';

  let tokenUrl;
  /** @type {URLSearchParams} */
  let body;

  if (useLegacy) {
    tokenUrl = 'https://connectapi.garmin.com/oauth-service/oauth/token';
    body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback,
      client_id: clientId,
      client_secret: clientSecret,
    });
  } else {
    if (!parsed.codeVerifier) {
      return NextResponse.json(
        {
          error:
            'Garmin OAuth state is missing PKCE data. Disconnect and connect again, or set GARMIN_OAUTH_USE_LEGACY=true if you use a legacy Garmin API client.',
        },
        { status: 400 }
      );
    }
    tokenUrl = 'https://diauth.garmin.com/di-oauth2-service/oauth/token';
    body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: parsed.codeVerifier,
      redirect_uri: callback,
    });
  }

  const response = await fetch(tokenUrl, {
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
    return garminTokenErrorResponse(payload, raw, response.ok ? 502 : response.status);
  }

  const expiresAt = payload.expires_in
    ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
    : null;

  await upsertDeviceToken({
    userId: parsed.userId,
    provider: 'garmin',
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt,
    metadata: {
      scope: payload.scope ?? null,
      oauth: useLegacy ? 'legacy' : 'pkce',
      token_endpoint: tokenUrl,
    },
  });

  return NextResponse.redirect(
    new URL(parsed.returnTo || '/forgefit-complete.html', publicOrigin)
  );
}
