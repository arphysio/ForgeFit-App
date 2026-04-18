import { supabase } from './supabase';
import { fetchGarminDailyMetrics } from './garmin';
import { getProviderAccessToken } from './deviceTokens';
import { fetchWhoopRecoveryMetrics } from './whoop';
import { getWhoopAccessTokenForUser } from './whoopToken';

export async function aggregateDailyRecovery(userId, date) {
  const [garminData, appleData, whoopData] = await Promise.allSettled([
    fetchGarminMetrics(userId, date),
    fetchAppleHealthMetrics(userId, date),
    fetchWhoopMetrics(userId, date),
  ]);

  const garmin = garminData.status === 'fulfilled' ? garminData.value : null;
  const apple = appleData.status === 'fulfilled' ? appleData.value : null;
  const whoop = whoopData.status === 'fulfilled' ? whoopData.value : null;

  // Weighted readiness score (0-100):
  // prioritize HRV > sleep quality > WHOOP recovery.
  const hrvScore =
    garmin?.hrv_ms != null ? Math.min((garmin.hrv_ms / 80) * 100, 100) : null;
  const sleepScore = apple?.sleep_score ?? garmin?.sleep_score ?? null;
  const whoopScore = whoop?.recovery_score ?? null;

  const scores = [hrvScore, sleepScore, whoopScore].filter((v) => v != null);
  const readiness = scores.length
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 50;

  // Store in recovery_data table.
  const { data } = await supabase
    .from('recovery_data')
    .upsert(
      {
        user_id: userId,
        date,
        hrv_ms: garmin?.hrv_ms,
        body_battery: garmin?.body_battery,
        sleep_score: sleepScore,
        whoop_recovery: whoopScore,
        readiness_score: readiness,
      },
      { onConflict: 'user_id,date' }
    )
    .select()
    .single();

  return data;
}

// These functions should call each device API using stored access tokens.
// Placeholders return null until provider-specific integrations are wired.
async function fetchGarminMetrics(userId, date) {
  const token = await getProviderAccessToken(userId, 'garmin');
  if (!token) return null;
  return fetchGarminDailyMetrics(token, date);
}

async function fetchAppleHealthMetrics(userId, date) {
  void userId;
  void date;
  return null;
}

async function fetchWhoopMetrics(userId, date) {
  const token = await getWhoopAccessTokenForUser(userId);
  if (!token) return null;
  return fetchWhoopRecoveryMetrics(token, date);
}

