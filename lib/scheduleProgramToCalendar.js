/**
 * Build calendar session payloads from a rehab/strength-style program JSON
 * or from a structured race-plan template (see racePlanTemplates.js).
 */

import { validateEnduranceStructure } from '@/lib/enduranceWorkout';
import { normalizeCalendarType } from '@/lib/calendarCreatePayload';
import { getRacePlanTemplate } from '@/lib/racePlanTemplates';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Monday on or before the given calendar day (local timezone, YYYY-MM-DD). */
export function mondayOnOrBeforeLocal(ymd) {
  const [y, m, d] = String(ymd || '')
    .slice(0, 10)
    .split('-')
    .map((x) => parseInt(x, 10));
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  const dow = dt.getDay();
  const diff = (dow + 6) % 7;
  dt.setDate(dt.getDate() - diff);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function addDaysLocalYmd(ymd, deltaDays) {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d + deltaDays);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/** @param dow1to7 — 1 = Monday … 7 = Sunday */
export function dateFromMondayWeekAndDow(weekMondayYmd, weekOffset, dow1to7) {
  const mon = mondayOnOrBeforeLocal(weekMondayYmd);
  if (!mon) return null;
  const d = Math.min(7, Math.max(1, Math.round(Number(dow1to7)) || 1));
  return addDaysLocalYmd(mon, weekOffset * 7 + (d - 1));
}

function inferProgramSessionType(program) {
  const name = String(program?.name || '').toLowerCase();
  if (name.includes('bike') || name.includes('cycle')) return 'bike';
  if (name.includes('run') || name.includes('rtr') || name.includes('return')) return 'run';
  return 'rehab';
}

function exerciseNotes(ex) {
  const bits = [];
  if (ex.sets != null && String(ex.sets).trim()) bits.push(`${ex.sets}×${ex.reps != null ? ex.reps : ''}`.trim());
  if (ex.rest != null && String(ex.rest).trim()) bits.push(`rest ${ex.rest}`);
  if (ex.cue != null && String(ex.cue).trim()) bits.push(String(ex.cue).trim());
  return bits.join(' · ').slice(0, 2000);
}

const DEFAULT_PATTERN = [1, 3, 5];

/**
 * @param {object} program — patient program JSON (phases[].exercises[])
 * @param {{ weekAnchorYmd: string, defaultTime?: string, weekdayPattern?: number[] }} opts
 * @param {{ maxSessions?: number }} [limits]
 */
export function buildCalendarSessionsFromRehabProgram(program, opts, limits = {}) {
  const maxSessions = Math.min(100, Math.max(1, limits.maxSessions ?? 80));
  const weekAnchor = opts.weekAnchorYmd?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor || '')) {
    return { error: 'weekAnchorYmd must be YYYY-MM-DD (ideally a Monday).' };
  }
  const weekMonday = mondayOnOrBeforeLocal(weekAnchor) || weekAnchor;
  const defaultTime = typeof opts.defaultTime === 'string' && opts.defaultTime.trim() ? opts.defaultTime.trim() : '09:00';
  let pattern = Array.isArray(opts.weekdayPattern) ? opts.weekdayPattern.map((n) => Math.round(Number(n))) : [];
  pattern = pattern.filter((n) => n >= 1 && n <= 7);
  if (!pattern.length) pattern = [...DEFAULT_PATTERN];
  pattern = [...new Set(pattern)].sort((a, b) => a - b);

  const phases = Array.isArray(program?.phases) ? program.phases : [];
  const flat = [];
  for (const ph of phases) {
    const exercises = Array.isArray(ph?.exercises) ? ph.exercises : [];
    for (const ex of exercises) {
      const name = typeof ex?.name === 'string' && ex.name.trim() ? ex.name.trim() : 'Exercise';
      flat.push({
        phaseLabel: typeof ph?.label === 'string' ? ph.label.trim() : 'Phase',
        name,
        sets: ex.sets,
        reps: ex.reps,
        rest: ex.rest,
        cue: ex.cue,
      });
    }
  }
  if (!flat.length) {
    return { error: 'Program has no exercises under phases[].exercises[].' };
  }

  const calType = inferProgramSessionType(program);
  const sessions = [];
  for (let i = 0; i < flat.length && sessions.length < maxSessions; i++) {
    const ex = flat[i];
    const w = Math.floor(i / pattern.length);
    const p = i % pattern.length;
    const dow = pattern[p];
    const date = dateFromMondayWeekAndDow(weekMonday, w, dow);
    if (!date) continue;
    const title = `${ex.name} · ${ex.phaseLabel}`.slice(0, 500);
    const notes = exerciseNotes(ex);
    sessions.push({
      date,
      time: defaultTime,
      title,
      type: calType === 'bike' ? 'bike' : calType === 'run' ? 'run' : 'rehab',
      sport: calType === 'bike' ? 'bike' : calType === 'run' ? 'run' : null,
      status: 'planned',
      notes,
    });
  }

  return {
    sessions,
    meta: {
      weekMonday,
      pattern,
      exerciseCount: flat.length,
      truncated: flat.length > sessions.length,
    },
  };
}

/**
 * @param {string} racePlanId
 * @param {{ weekAnchorYmd: string, defaultTime?: string, thresholdPaceMinPerKm?: string, ftpWatts?: number|null }} opts
 */
export function buildCalendarSessionsFromRacePlan(racePlanId, opts) {
  const tpl = getRacePlanTemplate(racePlanId);
  if (!tpl) {
    return { error: `Unknown race plan id "${racePlanId}".` };
  }
  const weekAnchor = opts.weekAnchorYmd?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekAnchor || '')) {
    return { error: 'weekAnchorYmd must be YYYY-MM-DD.' };
  }
  const weekMonday = mondayOnOrBeforeLocal(weekAnchor) || weekAnchor;
  const defaultTime = typeof opts.defaultTime === 'string' && opts.defaultTime.trim() ? opts.defaultTime.trim() : '07:00';
  const threshold =
    typeof opts.thresholdPaceMinPerKm === 'string' ? opts.thresholdPaceMinPerKm.trim().slice(0, 12) : '';
  const ftpRaw = opts.ftpWatts;
  const ftp =
      ftpRaw != null && ftpRaw !== '' && Number.isFinite(Number(ftpRaw))
        ? Math.round(Number(ftpRaw))
        : null;

  const sessions = [];
  for (const slot of tpl.slots || []) {
    const w = Math.max(0, Math.round(Number(slot.weekOffset)) || 0);
    const dow = Math.min(7, Math.max(1, Math.round(Number(slot.day)) || 1));
    const date = dateFromMondayWeekAndDow(weekMonday, w, dow);
    if (!date) continue;
    const rawStruct =
      slot.structure && typeof slot.structure === 'object'
        ? JSON.parse(JSON.stringify(slot.structure))
        : null;
    let structure_json = null;
    if (rawStruct) {
      if (threshold) rawStruct.thresholdPaceMinPerKm = threshold;
      if (ftp != null && ftp >= 30 && ftp <= 750) rawStruct.ftpWatts = ftp;
      const v = validateEnduranceStructure(rawStruct);
      if (v.error) {
        return { error: `Plan "${tpl.id}" slot "${slot.title || '?'}": ${v.error}` };
      }
      structure_json = v.structure;
    }
    sessions.push({
      date,
      time: slot.time || defaultTime,
      title: String(slot.title || 'Workout').slice(0, 500),
      type: normalizeCalendarType(slot.type || 'run') || 'run',
      sport: slot.sport === 'bike' ? 'bike' : slot.sport === 'run' ? 'run' : null,
      status: 'planned',
      notes: typeof slot.notes === 'string' ? slot.notes.slice(0, 2000) : '',
      structure: structure_json,
    });
  }

  if (!sessions.length) {
    return { error: 'Race plan template has no slots.' };
  }

  return { sessions, meta: { weekMonday, planId: tpl.id, planName: tpl.name } };
}
