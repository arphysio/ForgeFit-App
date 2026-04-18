/**
 * Summarize a completed-activity FIT (Zwift, Garmin, Wahoo, etc.) for calendar import.
 * Uses the stock fit-file-parser (list mode). Planned-workout FITs are rejected.
 */

import FitParser from 'fit-file-parser';

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function pad2(x) {
  return String(x).padStart(2, '0');
}

function sportToRunBike(s) {
  const t = String(s || '').toLowerCase();
  if (
    t.includes('bike') ||
    t.includes('cycl') ||
    t.includes('ebike') ||
    t.includes('virtualride') ||
    t === 'mountain_biking' ||
    t === 'gravel_cycling'
  ) {
    return 'bike';
  }
  if (
    t.includes('run') ||
    t.includes('walk') ||
    t.includes('virtualrun') ||
    t.includes('treadmill') ||
    t.includes('track') ||
    t.includes('trail')
  ) {
    return 'run';
  }
  return null;
}

function pickStartTime(sessions, fileIds) {
  let best = null;
  for (const s of sessions) {
    const ts = s?.timestamp;
    if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
      if (!best || ts < best) best = ts;
    }
  }
  if (!best && Array.isArray(fileIds)) {
    for (const f of fileIds) {
      const tc = f?.time_created;
      if (tc instanceof Date && !Number.isNaN(tc.getTime())) {
        if (!best || tc < best) best = tc;
      }
    }
  }
  return best;
}

function localYmdHm(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return {
    dateYmd: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    timeHm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function scheduledIsoFromDateAndTime(dateYmd, timeHm) {
  const [y, mo, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (!y || !mo || !d) return null;
  const parts = String(timeHm || '12:00').trim().split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) || 0;
  const h = Number.isFinite(hh) ? hh : 12;
  return new Date(y, mo - 1, d, h, mm, 0, 0).toISOString();
}

/**
 * @param {Buffer|Uint8Array|ArrayBuffer} buffer — raw FIT (gzip already removed)
 * @returns {Promise<{ error: string } | { dateYmd: string, timeHm: string, scheduledAt: string, durationSec: number, distanceM: number|null, sport: 'run'|'bike', type: string, title: string, completedMetrics: object }>}
 */
export async function parseActivityFitSummary(buffer) {
  let data;
  try {
    const parser = new FitParser({ force: true, mode: 'list' });
    data = await parser.parseAsync(buffer);
  } catch (e) {
    return { error: e?.message || 'Could not parse FIT file.' };
  }

  const fileIds = Array.isArray(data?.file_ids) ? data.file_ids : [];
  const primaryType = fileIds[0]?.type;
  if (primaryType === 'workout') {
    return {
      error:
        'This file is a planned workout FIT, not a completed activity. For structure, use CardioFit TrainingPeaks import. To log a Zwift ride, export the activity .fit from my.zwift.com (or use Strava sync).',
    };
  }

  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  if (!sessions.length) {
    return {
      error:
        'No activity data in this FIT. For Zwift: my.zwift.com → profile → Activities → download .fit for the completed session.',
    };
  }

  let durationSec = 0;
  let distanceM = 0;
  let sportGuess = null;

  for (const s of sessions) {
    const tt = n(s.total_timer_time) ?? n(s.total_elapsed_time);
    if (tt != null && tt > 0) durationSec += Math.round(tt);
    const dm = n(s.total_distance);
    if (dm != null && dm > 0) distanceM += Math.round(dm);
    const sp = sportToRunBike(s.sport);
    if (sp) sportGuess = sp;
  }

  if (!sportGuess) {
    sportGuess = distanceM > 5000 ? 'bike' : 'run';
  }

  if (durationSec <= 0) {
    return { error: 'Could not read activity duration from FIT (total_timer_time / total_elapsed_time).' };
  }

  durationSec = Math.min(durationSec, 86400);
  distanceM = distanceM > 0 ? Math.min(distanceM, 500_000) : null;

  const start = pickStartTime(sessions, fileIds) || new Date();
  const local = localYmdHm(start);
  if (!local) {
    return { error: 'Could not determine activity start time from FIT.' };
  }

  const { dateYmd, timeHm } = local;
  const scheduledAt = scheduledIsoFromDateAndTime(dateYmd, timeHm);
  if (!scheduledAt) {
    return { error: 'Invalid date derived from FIT.' };
  }

  const kind = sportGuess === 'run' ? 'run' : 'bike';
  const title =
    kind === 'run' ? 'Zwift / indoor run (imported)' : 'Zwift / indoor ride (imported)';

  const completedMetrics = {
    durationSec,
    distanceM: distanceM != null && distanceM > 0 ? distanceM : undefined,
    source: 'activity_fit',
  };

  return {
    dateYmd,
    timeHm,
    scheduledAt,
    durationSec,
    distanceM,
    sport: sportGuess,
    type: kind,
    title,
    completedMetrics,
  };
}
