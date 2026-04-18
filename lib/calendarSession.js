/** Shared calendar event shaping for API routes. */

import {
  buildPhaseChartBars,
  computePlannedLoad,
  summarizeCompliance,
} from '@/lib/enduranceWorkout';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function getMonthRange(monthStr) {
  const [year, month] = monthStr.split('-').map((v) => Number.parseInt(v, 10));
  if (!year || !month || month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    month: monthStr,
  };
}

export function normalizeCalendarEvent(session) {
  const dateKey =
    session.date?.slice?.(0, 10) ||
    session.completed_at?.slice(0, 10) ||
    session.scheduled_at?.slice(0, 10);
  if (!dateKey) return null;
  const rawType = String(session.type || '').toLowerCase();
  let type = 'workout';
  if (rawType === 'bike' || rawType.includes('bike') || rawType.includes('cycl')) type = 'bike';
  else if (rawType === 'run' || rawType.includes('run') || rawType.includes('cardio')) type = 'run';
  else if (rawType.includes('gym') || rawType.includes('strength') || rawType === 'rehab' || rawType.includes('condition'))
    type = 'gym';
  else if (rawType.includes('appt') || rawType.includes('review')) type = 'appt';
  else if (rawType.includes('mobility')) type = 'gym';

  const status = session.status === 'completed' || session.completed_at ? 'completed' : 'planned';
  const patient = session.patient_name || `User ${session.user_id || 'Unknown'}`;
  const title = session.title || session.type || 'Workout session';
  const timeSource = session.completed_at || session.scheduled_at;
  const dSrc = timeSource ? new Date(timeSource) : null;
  const timeHm =
    dSrc && !Number.isNaN(dSrc.getTime())
      ? `${pad2(dSrc.getHours())}:${pad2(dSrc.getMinutes())}`
      : '09:00';
  const time = timeSource
    ? new Date(timeSource).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : status === 'completed'
      ? 'Completed'
      : 'Planned';

  const sport = session.sport === 'bike' || session.sport === 'run' ? session.sport : null;
  const structure = session.structure_json ?? null;
  const notes = session.notes != null ? String(session.notes) : '';
  const completedLoad = session.completed_metrics_json ?? null;

  let plannedLoad = null;
  let phaseBars = null;
  let compliance = null;
  try {
    if (structure && Array.isArray(structure.steps) && structure.steps.length) {
      plannedLoad = computePlannedLoad(structure);
      phaseBars = buildPhaseChartBars(structure);
      if (plannedLoad && completedLoad && typeof completedLoad === 'object') {
        compliance = summarizeCompliance(plannedLoad, completedLoad);
      }
    }
  } catch {
    plannedLoad = null;
    phaseBars = null;
    compliance = null;
  }

  return {
    id: session.id,
    patientId: session.user_id ?? null,
    date: dateKey,
    type,
    patient,
    title,
    time,
    timeHm,
    status,
    sport,
    structure,
    notes,
    plannedLoad,
    completedLoad,
    compliance,
    phaseBars,
  };
}

/** Persisted on `workout_sessions.completed_metrics_json`. */
export function sanitizeCompletedMetricsForDb(m) {
  if (m == null || typeof m !== 'object') return null;
  const out = {};
  const ds = Number(m.durationSec);
  if (Number.isFinite(ds) && ds >= 0 && ds <= 864000) out.durationSec = Math.round(ds);
  const dist = Number(m.distanceM);
  if (Number.isFinite(dist) && dist >= 0 && dist <= 1e7) out.distanceM = Math.round(dist);
  const tss = Number(m.tss);
  if (Number.isFinite(tss) && tss >= 0 && tss <= 5000) out.tss = Math.round(tss * 10) / 10;
  const iff = Number(m.intensityFactor);
  if (Number.isFinite(iff) && iff >= 0.3 && iff <= 1.5) {
    out.intensityFactor = Math.round(iff * 1000) / 1000;
  }
  if (typeof m.source === 'string' && m.source.trim()) {
    out.source = m.source.trim().slice(0, 40);
  }
  const stravaId = Number(m.stravaActivityId);
  if (Number.isFinite(stravaId) && stravaId > 0 && stravaId < 1e15) {
    out.stravaActivityId = Math.round(stravaId);
  }
  const suffer = Number(m.sufferScore);
  if (Number.isFinite(suffer) && suffer >= 0 && suffer <= 5000) {
    out.sufferScore = Math.round(suffer * 10) / 10;
  }
  return Object.keys(out).length ? out : null;
}
