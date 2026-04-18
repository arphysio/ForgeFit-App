/**
 * Heuristic training paces from a recent race / time trial (McMillan-style zone bands).
 * Educational only — not the official McMillan calculator; uses public-domain-style
 * race-to-threshold scaling and zone windows similar to common endurance tables.
 */

/** Race pace (sec/km) × factor = threshold pace (sec/km); factor < 1 ⇒ threshold faster than race pace. */
const RACE_KM_TO_THRESHOLD_FRAC = [
  { km: 1.609344, frac: 0.84 },
  { km: 3, frac: 0.86 },
  { km: 5, frac: 0.88 },
  { km: 8, frac: 0.91 },
  { km: 10, frac: 0.935 },
  { km: 15, frac: 0.955 },
  { km: 21.0975, frac: 0.965 },
  { km: 30, frac: 0.94 },
  { km: 42.195, frac: 0.875 },
];

/** Zone pace bands as multipliers on threshold sec/km (higher = easier / slower). */
const ZONE_BANDS = {
  1: { lo: 1.16, hi: 1.3, label: 'Recovery / easy aerobic' },
  2: { lo: 1.08, hi: 1.15, label: 'Aerobic base' },
  3: { lo: 1.02, hi: 1.07, label: 'Steady / marathon' },
  4: { lo: 0.97, hi: 1.01, label: 'Threshold / tempo' },
  5: { lo: 0.88, hi: 0.965, label: 'VO2max / intervals' },
};

export function formatPaceMinKm(secPerKm) {
  const s = Math.max(120, Math.min(1200, Math.round(Number(secPerKm) || 0)));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function formatHms(totalSeconds) {
  const t = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Parse "MM:SS", "H:MM:SS", or "H:MM:SS" with multi-digit H.
 * @returns {number|null} total seconds
 */
export function parseRaceClockToSeconds(raw) {
  const t = String(raw || '').trim();
  if (!t) return null;
  const parts = t.split(':').map((p) => parseInt(p.trim(), 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  if (parts.length === 2) {
    const [a, b] = parts;
    if (a > 120 || b > 59) return null;
    return a * 60 + b;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m > 59 || s > 59) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

function thresholdFracForDistanceKm(distKm) {
  const d = Math.max(1.609, Math.min(50, Number(distKm) || 5));
  const tbl = RACE_KM_TO_THRESHOLD_FRAC;
  if (d <= tbl[0].km) return tbl[0].frac;
  for (let i = 1; i < tbl.length; i++) {
    const prev = tbl[i - 1];
    const cur = tbl[i];
    if (d <= cur.km) {
      const u = (d - prev.km) / (cur.km - prev.km);
      return prev.frac + u * (cur.frac - prev.frac);
    }
  }
  return tbl[tbl.length - 1].frac;
}

/** Riegel endurance scaling (common exponent 1.06). */
export function riegelPredictSeconds(timeSec, distFromKm, distToKm, exponent = 1.06) {
  const d1 = Math.max(0.001, Number(distFromKm) || 1);
  const d2 = Math.max(0.001, Number(distToKm) || 1);
  const t1 = Math.max(1, Number(timeSec) || 1);
  return t1 * Math.pow(d2 / d1, exponent);
}

/** Standard distances for a Riegel projection table (km). */
const ESTIMATE_TABLE_DISTANCES = [
  { label: '1 mile', km: 1.609344 },
  { label: '3 km', km: 3 },
  { label: '5 km', km: 5 },
  { label: '8 km', km: 8 },
  { label: '10 km', km: 10 },
  { label: '15 km', km: 15 },
  { label: 'Half marathon', km: 21.0975 },
  { label: '30 km', km: 30 },
  { label: 'Marathon', km: 42.195 },
];

/**
 * Anchor performance + Riegel-predicted times at other common race distances.
 * @param {number} exponent — default 1.06 (widely used endurance factor)
 */
export function buildRiegelEstimatedTimesTable(distanceKm, timeSeconds, exponent = 1.06) {
  const d0 = Number(distanceKm);
  const t0 = Number(timeSeconds);
  const anchorPace = t0 / d0;
  const out = [
    {
      label: 'Your entry (calibration)',
      distanceKm: Math.round(d0 * 10000) / 10000,
      predictedSeconds: Math.round(t0),
      predictedFormatted: formatHms(Math.round(t0)),
      paceMinPerKm: formatPaceMinKm(anchorPace),
      isAnchor: true,
    },
  ];
  for (const row of ESTIMATE_TABLE_DISTANCES) {
    if (Math.abs(row.km - d0) < 0.05) continue;
    const pred = riegelPredictSeconds(t0, d0, row.km, exponent);
    const rounded = Math.round(pred);
    out.push({
      label: row.label,
      distanceKm: row.km,
      predictedSeconds: rounded,
      predictedFormatted: formatHms(rounded),
      paceMinPerKm: formatPaceMinKm(pred / row.km),
      isAnchor: false,
    });
  }
  return out;
}

/**
 * @param {{
 *   distanceKm: number,
 *   timeSeconds: number,
 *   targetDistanceKm?: number|null,
 *   performanceBasis?: 'recent_race' | 'goal_event',
 * }} input
 */
export function computeTrainingPacesFromRace(input) {
  const performanceBasis = input.performanceBasis === 'goal_event' ? 'goal_event' : 'recent_race';
  const distanceKm = Number(input.distanceKm);
  const timeSeconds = Number(input.timeSeconds);
  if (!Number.isFinite(distanceKm) || distanceKm < 1.0 || distanceKm > 50) {
    return { error: 'distanceKm must be between 1 and 50 (use standard race distances or custom km).' };
  }
  if (!Number.isFinite(timeSeconds) || timeSeconds < 90 || timeSeconds > 72000) {
    return { error: 'time must be between 90 s and 72000 s (20 h).' };
  }

  const racePaceSecPerKm = timeSeconds / distanceKm;
  if (racePaceSecPerKm < 130 || racePaceSecPerKm > 1200) {
    return { error: 'Implied pace is outside a plausible range (~2:10/km–20:00/km).' };
  }

  const frac = thresholdFracForDistanceKm(distanceKm);
  const thresholdSecPerKm = racePaceSecPerKm * frac;

  const zones = [];
  for (let z = 1; z <= 5; z++) {
    const band = ZONE_BANDS[z];
    const lo = thresholdSecPerKm * band.lo;
    const hi = thresholdSecPerKm * band.hi;
    const mid = (lo + hi) / 2;
    zones.push({
      zone: z,
      label: band.label,
      minPaceMinPerKm: formatPaceMinKm(lo),
      maxPaceMinPerKm: formatPaceMinKm(hi),
      midPaceMinPerKm: formatPaceMinKm(mid),
      minSecPerKm: Math.round(lo),
      maxSecPerKm: Math.round(hi),
    });
  }

  let projectedRace = null;
  const targetKm = input.targetDistanceKm != null ? Number(input.targetDistanceKm) : null;
  if (
    performanceBasis === 'recent_race' &&
    Number.isFinite(targetKm) &&
    targetKm >= 1 &&
    targetKm <= 50 &&
    Math.abs(targetKm - distanceKm) > 0.01
  ) {
    const predSec = riegelPredictSeconds(timeSeconds, distanceKm, targetKm, 1.06);
    projectedRace = {
      distanceKm: Math.round(targetKm * 1000) / 1000,
      timeSeconds: Math.round(predSec),
      timeFormatted: formatHms(Math.round(predSec)),
    };
  }

  const estimatedRaceTimes = buildRiegelEstimatedTimesTable(distanceKm, timeSeconds, 1.06);

  return {
    disclaimer:
      'These values are automated heuristics (race-to-threshold scaling + zone windows). Estimated times use the Riegel formula (k=1.06) between distances—they are not the official McMillan Running calculator, not medical advice, and should be combined with how the athlete feels and your clinical judgment.',
    performanceBasis,
    inputs: {
      distanceKm: Math.round(distanceKm * 10000) / 10000,
      timeSeconds: Math.round(timeSeconds),
      timeFormatted: formatHms(Math.round(timeSeconds)),
    },
    racePaceMinPerKm: formatPaceMinKm(racePaceSecPerKm),
    racePaceSecPerKm: Math.round(racePaceSecPerKm),
    thresholdPaceMinPerKm: formatPaceMinKm(thresholdSecPerKm),
    thresholdSecPerKm: Math.round(thresholdSecPerKm),
    thresholdFracFromRacePace: Math.round(frac * 1000) / 1000,
    zones,
    projectedRace,
    estimatedRaceTimes,
  };
}
