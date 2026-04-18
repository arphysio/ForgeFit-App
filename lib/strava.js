/**
 * Strava API helpers — manual activity creation (no GPS file).
 * https://developers.strava.com/docs/reference/#api-Activities-createActivity
 */

import { totalMetersFromStructure, totalSecondsFromStructure } from './enduranceWorkout';

export async function stravaCreateManualActivity(accessToken, fields) {
  const body = new URLSearchParams();
  body.set('name', String(fields.name || 'Workout').slice(0, 200));
  body.set('sport_type', String(fields.sport_type || 'Workout'));
  body.set('type', String(fields.type || fields.sport_type || 'Workout'));
  body.set('start_date_local', String(fields.start_date_local));
  body.set('elapsed_time', String(Math.max(1, Math.round(Number(fields.elapsed_time) || 60))));
  if (fields.description) body.set('description', String(fields.description).slice(0, 2000));
  if (fields.distance != null && Number.isFinite(Number(fields.distance))) {
    body.set('distance', String(Math.round(Number(fields.distance))));
  }

  const res = await fetch('https://www.strava.com/api/v3/activities', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
    cache: 'no-store',
  });

  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || raw || `Strava HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json;
}

/** List activities for the authenticated athlete (epoch seconds for `after` / `before`). */
export async function stravaListAthleteActivities(accessToken, { after, before, perPage = 100, page = 1 } = {}) {
  const url = new URL('https://www.strava.com/api/v3/athlete/activities');
  url.searchParams.set('after', String(Math.max(0, Math.floor(Number(after) || 0))));
  url.searchParams.set('before', String(Math.max(0, Math.floor(Number(before) || 0))));
  url.searchParams.set('per_page', String(Math.min(200, Math.max(1, Math.floor(Number(perPage) || 100)))));
  url.searchParams.set('page', String(Math.max(1, Math.floor(Number(page) || 1))));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || raw || `Strava HTTP ${res.status}`;
    throw new Error(msg);
  }
  return Array.isArray(json) ? json : [];
}

/** Single activity (detail). */
export async function stravaGetActivityById(accessToken, activityId) {
  const id = String(activityId || '').trim();
  if (!id) throw new Error('Missing activity id.');
  const res = await fetch(`https://www.strava.com/api/v3/activities/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  const raw = await res.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json?.message || json?.error || raw || `Strava HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/** Map ForgeFit calendar type + sport to Strava sport_type. */
export function forgeFitToStravaSportType(type, sport) {
  const t = String(type || '').toLowerCase();
  const s = String(sport || '').toLowerCase();
  if (s === 'bike' || t === 'bike') return 'Ride';
  if (t.includes('run') || s === 'run') return 'Run';
  if (t.includes('swim')) return 'Swim';
  if (t.includes('walk')) return 'Walk';
  return 'Workout';
}

export { totalSecondsFromStructure, totalMetersFromStructure };
