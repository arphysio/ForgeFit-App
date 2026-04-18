/** Shared validation for POST /api/calendar and batch / from-schedule routes. */

import { validateEnduranceStructure } from '@/lib/enduranceWorkout';

export const ALLOWED_CALENDAR_TYPES = new Set([
  'run',
  'bike',
  'gym',
  'appt',
  'workout',
  'rehab',
  'conditioning',
  'mobility',
  'strength',
]);

export function normalizeCalendarType(t) {
  const s = String(t || 'workout').toLowerCase().trim();
  if (ALLOWED_CALENDAR_TYPES.has(s)) return s;
  return 'workout';
}

export function scheduledIsoFromDateAndTime(dateYmd, timeHm) {
  const [y, mo, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (!y || !mo || !d) return null;
  const parts = String(timeHm || '09:00').trim().split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) || 0;
  const h = Number.isFinite(hh) ? hh : 9;
  return new Date(y, mo - 1, d, h, mm, 0, 0).toISOString();
}

function parseSport(body) {
  const s = typeof body.sport === 'string' ? body.sport.trim().toLowerCase() : '';
  if (s === 'run' || s === 'bike') return s;
  return null;
}

/**
 * @returns {{ error: string } | { date: string, title: string, type: string, status: string, notes: string, scheduledAt: string, sport: string|null, structure_json: object|null }}
 */
export function parseCalendarSessionPayload(body) {
  const date = typeof body.date === 'string' ? body.date.trim().slice(0, 10) : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: 'Invalid or missing date (use YYYY-MM-DD).' };
  }
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 500) {
    return { error: 'Title is required (max 500 characters).' };
  }
  const time = typeof body.time === 'string' ? body.time.trim() : '';
  const type = normalizeCalendarType(body.type);
  const status = body.status === 'completed' ? 'completed' : 'planned';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';
  const scheduledAt = scheduledIsoFromDateAndTime(date, time || '09:00');
  const sport = parseSport(body);

  let structure_json = null;
  if (body.structure != null && typeof body.structure === 'object') {
    const merged = { ...body.structure, sport: sport || body.structure?.sport };
    const v = validateEnduranceStructure(merged);
    if (v.error) return { error: v.error };
    structure_json = v.structure;
  } else if (body.structure_json != null) {
    let raw = body.structure_json;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        return { error: 'structure_json must be valid JSON.' };
      }
    }
    if (raw == null || typeof raw !== 'object') {
      return { error: 'structure_json must be an object.' };
    }
    const merged = { ...raw, sport: sport || raw.sport };
    const v = validateEnduranceStructure(merged);
    if (v.error) return { error: v.error };
    structure_json = v.structure;
  }

  const sportOut = sport || structure_json?.sport || null;

  return { date, title, type, status, notes, scheduledAt, sport: sportOut, structure_json };
}
