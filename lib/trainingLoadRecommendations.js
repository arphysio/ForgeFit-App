/**
 * Heuristic training-day / load guidance from recovery metrics + recent completed load.
 * Educational only — not medical advice or a diagnosis.
 */

import { buildCardioPatientAnalytics } from '@/lib/cardioFitAnalytics';

/** Add calendar days to YYYY-MM-DD (UTC date math). */
export function addDaysYmd(ymd, deltaDays) {
  const [y, m, d] = String(ymd || '')
    .slice(0, 10)
    .split('-')
    .map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function mean(nums) {
  const a = (nums || []).filter((x) => Number.isFinite(x));
  if (!a.length) return null;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

function recoveryMapFromRows(recoveryRows) {
  const m = new Map();
  for (const r of recoveryRows || []) {
    const d = r?.date?.slice?.(0, 10);
    if (!d) continue;
    m.set(d, {
      hrv: r.hrv_ms != null ? Number(r.hrv_ms) : null,
      sleep: r.sleep_score != null ? Number(r.sleep_score) : null,
      readiness: r.readiness_score != null ? Number(r.readiness_score) : null,
      whoop: r.whoop_recovery != null ? Number(r.whoop_recovery) : null,
    });
  }
  return m;
}

function aggregateStressInRange(sessions, fromYmd, toYmd) {
  let tss = 0;
  let minutes = 0;
  let n = 0;
  for (const s of sessions || []) {
    const day = s.date?.slice?.(0, 10);
    if (!day || day < fromYmd || day > toYmd) continue;
    const cl = s.completedLoad;
    if (!cl || typeof cl !== 'object') continue;
    const ct = Number(cl.tss);
    const sec = Number(cl.durationSec);
    if (Number.isFinite(ct) && ct > 0) {
      tss += ct;
      n += 1;
    }
    if (Number.isFinite(sec) && sec >= 120) {
      minutes += sec / 60;
    }
  }
  return { tss, minutes, n };
}

/**
 * @param {object} params
 * @param {ReturnType<typeof buildCardioPatientAnalytics>} params.analytics
 * @param {Array<{date:string, hrv_ms?:number, sleep_score?:number, readiness_score?:number, whoop_recovery?:number}>} params.recoveryRows
 * @param {string} [params.referenceDate] — YYYY-MM-DD (default: UTC today)
 */
export function buildTrainingLoadGuidance({ analytics, recoveryRows, referenceDate }) {
  const ref = referenceDate || new Date().toISOString().slice(0, 10);
  const recMap = recoveryMapFromRows(recoveryRows);
  const sessions = analytics?.sessions || [];
  const weekly = analytics?.weekly || [];
  const priorSignals = Array.isArray(analytics?.signals) ? [...analytics.signals] : [];

  const last7Start = addDaysYmd(ref, -6);
  const prev7Start = addDaysYmd(ref, -13);
  const prev7End = addDaysYmd(ref, -7);

  const last7 = aggregateStressInRange(sessions, last7Start, ref);
  const prev7 = aggregateStressInRange(sessions, prev7Start, prev7End);

  const loadRatio =
    prev7.tss > 40 && last7.tss > 0 ? last7.tss / prev7.tss : last7.tss > 120 && prev7.tss < 20 ? 2.5 : null;

  const last7Dates = [];
  for (let i = 0; i < 7; i++) {
    last7Dates.push(addDaysYmd(ref, -i));
  }
  const readinessSeries = last7Dates.map((d) => recMap.get(d)?.readiness).filter((x) => Number.isFinite(x));
  const sleepSeries = last7Dates.map((d) => recMap.get(d)?.sleep).filter((x) => Number.isFinite(x));
  const hrvSeries = last7Dates.map((d) => recMap.get(d)?.hrv).filter((x) => Number.isFinite(x) && x > 0);

  const readinessToday = recMap.get(ref)?.readiness ?? null;
  const yYesterday = addDaysYmd(ref, -1);
  const readinessYesterday = yYesterday ? recMap.get(yYesterday)?.readiness ?? null : null;
  const sleepToday = recMap.get(ref)?.sleep ?? null;
  const avgReadiness7 = mean(readinessSeries);
  const avgSleep7 = mean(sleepSeries);

  const hrvRecent = mean(hrvSeries.slice(Math.max(0, hrvSeries.length - 3)));
  const hrvOlder = mean(hrvSeries.slice(0, Math.max(0, hrvSeries.length - 3)));
  let hrvDeltaPct = null;
  if (hrvRecent != null && hrvOlder != null && hrvOlder > 5) {
    hrvDeltaPct = ((hrvRecent - hrvOlder) / hrvOlder) * 100;
  }

  const bullets = [];
  let verdict = 'moderate';
  let headline = 'Use subjective feel alongside the numbers below.';
  let loadAdjustmentPct = 0;
  let trainToday = true;

  if (loadRatio != null && loadRatio > 1.2) {
    bullets.push(
      `Completed load (TSS sum) in the last 7 days is ~${Math.round((loadRatio - 1) * 100)}% higher than the prior 7 days — fatigue risk rises if this persists.`
    );
  } else if (loadRatio != null && loadRatio < 0.72 && prev7.tss > 50) {
    bullets.push(
      'Completed load dropped sharply vs the prior week — may reflect recovery, illness, or missed sessions; confirm intent before pushing volume back up.'
    );
  }

  if (weekly.length >= 2) {
    const last = weekly[weekly.length - 1];
    const prev = weekly[weekly.length - 2];
    if (last.completedTss > 0 && prev.completedTss > 0) {
      const wJump = (last.completedTss - prev.completedTss) / prev.completedTss;
      if (wJump > 0.3 && (readinessToday == null || readinessToday >= 55)) {
        bullets.push(
          'Week-over-week completed TSS jumped — if effort felt harder than usual, bias the next few days toward easier sessions.'
        );
      }
    }
  }

  let recoveryLow = false;
  let recoveryModerate = false;

  const twoDayPoor =
    readinessToday != null &&
    readinessYesterday != null &&
    Number.isFinite(readinessToday) &&
    Number.isFinite(readinessYesterday) &&
    readinessToday < 50 &&
    readinessYesterday < 52;

  if (readinessToday != null && Number.isFinite(readinessToday)) {
    if (readinessToday < 42) recoveryLow = true;
    else if (readinessToday < 58) recoveryModerate = true;
    bullets.push(`Readiness / recovery score for ${ref}: ${Math.round(readinessToday)}.`);
  } else if (avgReadiness7 != null) {
    bullets.push(`7-day average readiness (where logged): ${Math.round(avgReadiness7)}.`);
  } else {
    bullets.push('No readiness scores in recovery_data for this window — load-only heuristics below.');
  }

  if (twoDayPoor) {
    bullets.push('Readiness has been sub-threshold two days in a row — a full rest or very easy day is reasonable.');
    recoveryLow = true;
  }

  if (sleepToday != null && avgSleep7 != null && sleepToday < avgSleep7 - 12) {
    bullets.push('Last logged sleep score is notably below your recent average — consider extra sleep before hard training.');
    recoveryModerate = true;
  }

  if (hrvDeltaPct != null && hrvDeltaPct < -10) {
    bullets.push(`HRV (rMSSD) trend over the last week is down ~${Math.round(-hrvDeltaPct)}% vs earlier in the week — a common fatigue signal (non-specific).`);
    recoveryModerate = true;
  }

  if (recoveryLow) {
    verdict = 'rest_day';
    headline = 'Favor rest or very light movement today';
    loadAdjustmentPct = -100;
    trainToday = false;
  } else if (
    recoveryModerate ||
    (readinessToday != null && readinessToday < 55) ||
    (loadRatio != null && loadRatio > 1.18 && (readinessToday == null || readinessToday < 68))
  ) {
    verdict = 'unload';
    headline = 'Bias toward an unload / easy day (lower stress, shorter or easier)';
    loadAdjustmentPct = readinessToday != null && readinessToday < 52 ? -30 : -18;
    trainToday = true;
  } else if (readinessToday != null && readinessToday >= 72 && (loadRatio == null || loadRatio < 1.08)) {
    verdict = 'full_go';
    headline = 'Recovery signals look supportive for planned training';
    loadAdjustmentPct = 0;
    trainToday = true;
  } else {
    verdict = 'moderate';
    headline = 'Train if you feel good — keep intensity honest and avoid stacking hard days';
    loadAdjustmentPct = -5;
    trainToday = true;
  }

  for (const s of priorSignals) {
    if (!bullets.some((b) => b.includes(s.slice(0, 40)))) bullets.push(s);
  }

  const disclaimer =
    'These notes are automated heuristics from wearable-style recovery fields and logged training load. They are not medical advice and do not replace clinical judgment or how the athlete feels.';

  return {
    referenceDate: ref,
    verdict,
    headline,
    trainToday,
    loadAdjustmentPct,
    suggestedVolumeNote:
      verdict === 'rest_day'
        ? 'Target ~0% of usual structured intensity; walking or mobility only if desired.'
        : verdict === 'unload'
          ? `Aim for roughly ${100 + loadAdjustmentPct}% of your recent week’s completed training stress (time × intensity), not an exact prescription.`
          : `Completed load can stay near recent levels (~${100 + loadAdjustmentPct}% of your rolling average) if symptoms and pain are stable.`,
    bullets: bullets.slice(0, 8),
    metricsUsed: {
      readinessToday,
      readinessYesterday,
      avgReadiness7: avgReadiness7 != null ? Math.round(avgReadiness7) : null,
      last7dCompletedTss: Math.round(last7.tss),
      prev7dCompletedTss: Math.round(prev7.tss),
      loadRatio: loadRatio != null ? Math.round(loadRatio * 100) / 100 : null,
      hrvDeltaPct: hrvDeltaPct != null ? Math.round(hrvDeltaPct) : null,
    },
    disclaimer,
  };
}

/**
 * @param {Array<object>} workoutRows — workout_sessions rows
 * @param {Array<object>} recoveryRows — recovery_data rows
 * @param {{ weeks?: number, referenceDate?: string }} opts
 */
export function buildPatientTrainingGuidancePack(workoutRows, recoveryRows, opts = {}) {
  const weeks = opts.weeks ?? 8;
  const analytics = buildCardioPatientAnalytics(workoutRows, weeks);
  const guidance = buildTrainingLoadGuidance({
    analytics,
    recoveryRows: recoveryRows || [],
    referenceDate: opts.referenceDate,
  });
  return { weeks, ...analytics, guidance };
}
