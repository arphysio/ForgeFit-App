import { computePlannedLoad, summarizeCompliance } from '@/lib/enduranceWorkout';

/** Monday-based week id (UTC) for grouping. */
function weekKeyMondayUtc(dateYmd) {
  const [y, m, d] = String(dateYmd || '')
    .slice(0, 10)
    .split('-')
    .map((x) => parseInt(x, 10));
  if (!y || !m || !d) return 'unknown';
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  const mondayOffset = (dow + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - mondayOffset);
  return utc.toISOString().slice(0, 10);
}

function isCardioRow(row) {
  const t = String(row?.type || '').toLowerCase();
  const s = String(row?.sport || '').toLowerCase();
  const hasStructure = row?.structure_json && Array.isArray(row.structure_json.steps) && row.structure_json.steps.length;
  return hasStructure || s === 'run' || s === 'bike' || t === 'run' || t === 'bike';
}

/**
 * @param {Array<object>} rows — workout_sessions rows
 * @param {number} weeks — lookback window (informational; rows should already be filtered by date)
 */
export function buildCardioPatientAnalytics(rows, weeks = 8) {
  const sessions = [];
  for (const row of rows || []) {
    if (!isCardioRow(row)) continue;
    let plannedLoad = null;
    let compliance = null;
    try {
      if (row.structure_json?.steps?.length) {
        plannedLoad = computePlannedLoad(row.structure_json);
        if (plannedLoad && row.completed_metrics_json) {
          compliance = summarizeCompliance(plannedLoad, row.completed_metrics_json);
        }
      }
    } catch {
      plannedLoad = null;
    }
    sessions.push({
      id: row.id,
      date: row.date,
      title: row.title,
      type: row.type,
      sport: row.sport,
      status: row.status,
      plannedLoad,
      completedLoad: row.completed_metrics_json || null,
      compliance,
    });
  }

  const byWeek = new Map();
  for (const s of sessions) {
    const wk = weekKeyMondayUtc(s.date);
    if (!byWeek.has(wk)) {
      byWeek.set(wk, {
        weekKey: wk,
        plannedTss: 0,
        completedTss: 0,
        plannedMin: 0,
        completedMin: 0,
        adherenceSum: 0,
        adherenceN: 0,
        sessions: 0,
      });
    }
    const b = byWeek.get(wk);
    b.sessions += 1;
    if (s.plannedLoad?.tss != null) b.plannedTss += s.plannedLoad.tss;
    if (s.completedLoad?.tss != null) b.completedTss += s.completedLoad.tss;
    if (s.plannedLoad?.durationSec != null) b.plannedMin += s.plannedLoad.durationSec / 60;
    if (s.completedLoad?.durationSec != null) b.completedMin += s.completedLoad.durationSec / 60;
    if (s.compliance?.overallPercent != null) {
      b.adherenceSum += s.compliance.overallPercent;
      b.adherenceN += 1;
    }
  }

  const weekly = Array.from(byWeek.values()).sort((a, b) =>
    String(a.weekKey).localeCompare(String(b.weekKey))
  );

  const signals = [];
  if (weekly.length >= 2) {
    const last = weekly[weekly.length - 1];
    const prev = weekly[weekly.length - 2];
    if (last.completedTss > 0 && prev.completedTss > 0) {
      const jump = (last.completedTss - prev.completedTss) / prev.completedTss;
      if (jump > 0.25) {
        signals.push(
          `Completed load (TSS) jumped ~${Math.round(jump * 100)}% last week vs the week before — watch for fatigue if effort also felt harder.`
        );
      }
      if (jump < -0.25) {
        signals.push(
          `Completed TSS dropped ~${Math.round(-jump * 100)}% week-over-week — may reflect recovery, missed sessions, or illness; check in with the athlete.`
        );
      }
    }
    if (last.adherenceN && prev.adherenceN) {
      const aLast = last.adherenceSum / last.adherenceN;
      const aPrev = prev.adherenceSum / prev.adherenceN;
      if (aPrev - aLast > 12) {
        signals.push(
          `Session adherence vs plan fell ~${Math.round(aPrev - aLast)} points week-over-week — good time to simplify or reassess intensity.`
        );
      }
    }
  }

  if (weekly.length >= 4) {
    const chunk = (n) => weekly.slice(-n);
    const sumTss = (arr) => arr.reduce((s, w) => s + (w.completedTss || 0), 0);
    const recent = sumTss(chunk(4));
    const prior = sumTss(chunk(8).slice(0, 4));
    if (prior > 50 && recent > prior * 1.12) {
      signals.push(
        'Rolling 4-week completed TSS is meaningfully higher than the prior 4-week block — consider a recovery / deload week to reduce injury risk.'
      );
    }
  }

  if (!sessions.length) {
    signals.push('No structured run/cycle sessions in this window yet. Schedule CardioFit workouts from the portal to unlock trends.');
  }

  return {
    weeks,
    sessionCount: sessions.length,
    sessions,
    weekly,
    signals,
  };
}
