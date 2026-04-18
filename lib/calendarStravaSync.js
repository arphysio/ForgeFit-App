import { supabase } from '@/lib/supabase';
import { getProviderAccessToken } from '@/lib/deviceTokens';
import { stravaListAthleteActivities, stravaGetActivityById } from '@/lib/strava';
import { computePlannedLoad } from '@/lib/enduranceWorkout';
import { sanitizeCompletedMetricsForDb } from '@/lib/calendarSession';

export function dayEpochRangeUtc(dateYmd) {
  const parts = String(dateYmd || '')
    .trim()
    .slice(0, 10)
    .split('-')
    .map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    const after = Math.floor(Date.UTC(y, m, d, 0, 0, 0) / 1000);
    const before = Math.floor(Date.UTC(y, m, d + 1, 0, 0, 0) / 1000);
    return { after, before };
  }
  const [y, mo, d] = parts;
  const after = Math.floor(Date.UTC(y, mo - 1, d, 0, 0, 0) / 1000);
  const before = Math.floor(Date.UTC(y, mo - 1, d + 1, 0, 0, 0) / 1000);
  return { after, before };
}

export function stravaTypesForSession(session) {
  const t = String(session?.type || '').toLowerCase();
  const s = String(session?.sport || '').toLowerCase();
  const types = new Set();
  if (s === 'bike' || t === 'bike') {
    types.add('Ride');
    types.add('VirtualRide'); // Zwift cycling → Strava
    types.add('EBikeRide');
  }
  if (s === 'run' || t === 'run' || t.includes('run')) {
    types.add('Run');
    types.add('VirtualRun'); // Zwift running → Strava
  }
  if (!types.size) {
    types.add('Run');
    types.add('Ride');
    types.add('Workout');
  }
  return types;
}

export function pickBestStravaActivity(activities, session) {
  if (!Array.isArray(activities) || !activities.length) return null;
  const allowed = stravaTypesForSession(session);
  let plannedSec = null;
  try {
    if (session?.structure_json?.steps?.length) {
      const pl = computePlannedLoad(session.structure_json);
      plannedSec = pl?.durationSec ?? null;
    }
  } catch {
    plannedSec = null;
  }
  const filtered = activities.filter((a) => allowed.has(String(a?.sport_type || '')));
  const pool = filtered.length ? filtered : activities;
  let best = null;
  let bestScore = -Infinity;
  for (const a of pool) {
    const mt = Number(a.moving_time) || Number(a.elapsed_time) || 0;
    if (!mt) continue;
    let score = mt;
    if (plannedSec && plannedSec > 60) {
      const ratio = Math.min(plannedSec, mt) / Math.max(plannedSec, mt);
      score = ratio * 1e6 + mt;
    }
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function stravaActivityToCompletedMetrics(activity, { plannedDurationSec } = {}) {
  const moving = Number(activity.moving_time) || Number(activity.elapsed_time) || 0;
  const elapsed = Number(activity.elapsed_time) || moving;
  const durationSec = Math.max(1, moving || elapsed);
  const distM =
    activity.distance != null && Number.isFinite(Number(activity.distance))
      ? Math.round(Number(activity.distance))
      : null;
  const suffer = activity.suffer_score != null ? Number(activity.suffer_score) : null;
  let tss = null;
  let intensityFactor = null;
  if (suffer != null && Number.isFinite(suffer) && suffer >= 0) {
    tss = Math.round(Math.min(500, suffer * 0.72));
    intensityFactor = Math.round((0.55 + 0.45 * Math.min(1, suffer / 130)) * 1000) / 1000;
  } else if (plannedDurationSec && plannedDurationSec > 60 && durationSec > 60) {
    const hours = durationSec / 3600;
    const ratio = Math.min(plannedDurationSec, durationSec) / Math.max(plannedDurationSec, durationSec);
    intensityFactor = Math.round((0.68 + 0.22 * ratio) * 1000) / 1000;
    tss = Math.round(hours * intensityFactor * intensityFactor * 100);
  }
  const raw = {
    durationSec,
    distanceM: distM,
    tss,
    intensityFactor,
    source: 'strava',
    stravaActivityId: activity.id,
  };
  if (suffer != null && Number.isFinite(suffer)) raw.sufferScore = suffer;
  return sanitizeCompletedMetricsForDb(raw);
}

/**
 * Fetches Strava activities on the session calendar date, picks best match, writes `completed_metrics_json`.
 * @returns {{ ok: true, completed: object, activity: object } | { error: string }}
 */
export async function syncStravaCompletionForUserSession({ userId, sessionId, fetchDetail = true }) {
  const { data: session, error } = await supabase
    .from('workout_sessions')
    .select('id, user_id, date, scheduled_at, type, title, sport, structure_json')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return { error: error.message };
  if (!session) return { error: 'Session not found.' };

  const token = await getProviderAccessToken(userId, 'strava');
  if (!token) {
    return {
      error: 'Strava is not connected for this account. Connect Strava under Integrations (ForgeFit portal or app settings).',
    };
  }

  const { after, before } = dayEpochRangeUtc(session.date);
  let activities;
  try {
    activities = await stravaListAthleteActivities(token, { after, before, perPage: 100, page: 1 });
  } catch (e) {
    return { error: e?.message || 'Could not read Strava activities.' };
  }

  const best = pickBestStravaActivity(activities, session);
  if (!best) {
    return {
      error: 'No Strava activities found for that calendar date. Check the workout was recorded on Strava for the same day (UTC).',
    };
  }

  let detail = best;
  if (fetchDetail && best.id != null) {
    try {
      detail = await stravaGetActivityById(token, best.id);
    } catch {
      detail = best;
    }
  }

  let plannedDurationSec = null;
  try {
    if (session.structure_json?.steps?.length) {
      const pl = computePlannedLoad(session.structure_json);
      plannedDurationSec = pl?.durationSec ?? null;
    }
  } catch {
    plannedDurationSec = null;
  }

  const completed = stravaActivityToCompletedMetrics(detail, { plannedDurationSec });
  if (!completed) {
    return { error: 'Could not map Strava activity to completion metrics.' };
  }

  const { error: upErr } = await supabase
    .from('workout_sessions')
    .update({ completed_metrics_json: completed, status: 'completed' })
    .eq('id', sessionId)
    .eq('user_id', userId);

  if (upErr) return { error: upErr.message };

  return {
    ok: true,
    completed,
    activity: {
      id: detail.id,
      name: detail.name,
      sport_type: detail.sport_type,
      start_date_local: detail.start_date_local,
      moving_time: detail.moving_time,
      distance: detail.distance,
      suffer_score: detail.suffer_score,
    },
  };
}
