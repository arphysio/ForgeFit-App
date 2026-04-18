import { supabase } from './supabase';
import { upsertDeviceToken } from './deviceTokens';

const WHOOP_TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

/**
 * Returns a valid WHOOP access token for `user_id`, refreshing with `refresh_token` when near expiry.
 * Requires WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET on the server for refresh.
 */
export async function getWhoopAccessTokenForUser(userId) {
  const { data, error } = await supabase
    .from('device_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', 'whoop')
    .maybeSingle();

  if (error || !data?.access_token) return null;

  const expMs = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const bufferMs = 120_000;
  if (expMs > Date.now() + bufferMs) return data.access_token;
  if (!data.refresh_token) return data.access_token;

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return data.access_token;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: data.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    scope: 'offline read:recovery',
  });

  const res = await fetch(WHOOP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const raw = await res.text();
  let j = null;
  try {
    j = raw ? JSON.parse(raw) : null;
  } catch {
    j = null;
  }
  if (!res.ok || !j?.access_token) return data.access_token;

  const expiresAt = j.expires_in
    ? new Date(Date.now() + j.expires_in * 1000).toISOString()
    : null;

  await upsertDeviceToken({
    userId,
    provider: 'whoop',
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? data.refresh_token,
    expiresAt,
    metadata: { scope: j.scope ?? null, refreshed_at: new Date().toISOString() },
  });

  return j.access_token;
}
