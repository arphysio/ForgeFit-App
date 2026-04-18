import { supabase } from './supabase';

export async function upsertDeviceToken({
  userId,
  provider,
  accessToken,
  refreshToken = null,
  expiresAt = null,
  metadata = null,
}) {
  const { data, error } = await supabase
    .from('device_tokens')
    .upsert(
      {
        user_id: userId,
        provider,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        metadata,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,provider' }
    )
    .select()
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getProviderAccessToken(userId, provider) {
  const { data } = await supabase
    .from('device_tokens')
    .select('access_token')
    .eq('user_id', userId)
    .eq('provider', provider)
    .maybeSingle();

  return data?.access_token ?? null;
}

export async function listDeviceStatuses(userId) {
  const { data, error } = await supabase
    .from('device_tokens')
    .select('provider, updated_at, expires_at')
    .eq('user_id', userId);

  if (error) return {};

  const now = Date.now();
  const result = {};
  for (const row of data || []) {
    const exp = row.expires_at ? new Date(row.expires_at).getTime() : null;
    result[row.provider] = {
      connected: exp ? exp > now : true,
      updatedAt: row.updated_at ?? null,
      expiresAt: row.expires_at ?? null,
    };
  }
  return result;
}
