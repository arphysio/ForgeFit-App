/** WHOOP Developer API base (v2 recovery collection). */

function addUtcDay(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/**
 * Fetch recovery for a calendar date (UTC day window). Uses v2 `/recovery` collection.
 * @see https://developer.whoop.com/api/
 */
export async function fetchWhoopRecoveryMetrics(accessToken, date) {
  const startIso = `${date}T00:00:00.000Z`;
  const endIso = `${addUtcDay(date, 1)}T00:00:00.000Z`;
  const query = new URLSearchParams({
    limit: '25',
    start: startIso,
    end: endIso,
  });

  const res = await fetch(`https://api.prod.whoop.com/developer/v2/recovery?${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const raw = await res.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const msg = payload?.message || payload?.error || raw?.slice(0, 200) || res.status;
    throw new Error(`Whoop recovery fetch failed (${res.status}): ${msg}`);
  }

  const records = Array.isArray(payload?.records) ? payload.records : [];
  const item =
    records.find((r) => r.score_state === 'SCORED' && r.score?.recovery_score != null) ||
    records.find((r) => r.score?.recovery_score != null) ||
    records[0];

  const score = item?.score;

  return {
    recovery_score: score?.recovery_score ?? null,
    hrv_rmssd_milli: score?.hrv_rmssd_milli ?? null,
    resting_heart_rate: score?.resting_heart_rate ?? null,
  };
}
