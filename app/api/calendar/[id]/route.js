import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { validateEnduranceStructure } from '@/lib/enduranceWorkout';
import { normalizeCalendarEvent, sanitizeCompletedMetricsForDb } from '@/lib/calendarSession';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

const ALLOWED_TYPES = new Set([
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

function normalizeType(t) {
  const s = String(t || 'workout').toLowerCase().trim();
  if (ALLOWED_TYPES.has(s)) return s;
  return 'workout';
}

function parseSport(body) {
  const s = typeof body.sport === 'string' ? body.sport.trim().toLowerCase() : '';
  if (s === 'run' || s === 'bike') return s;
  return null;
}

function scheduledIsoFromDateAndTime(dateYmd, timeHm) {
  const [y, mo, d] = dateYmd.split('-').map((x) => parseInt(x, 10));
  if (!y || !mo || !d) return null;
  const parts = String(timeHm || '09:00').trim().split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) || 0;
  const h = Number.isFinite(hh) ? hh : 9;
  return new Date(y, mo - 1, d, h, mm, 0, 0).toISOString();
}

/** PATCH — clinician portal updates a patient's workout session (incl. structure). */
export async function PATCH(req, { params }) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  const sessionId = params?.id;
  if (!isValidUuid(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id.' }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid or missing patientId.' }, { status: 400 });
  }

  const { data: existing, error: readErr } = await supabase
    .from('workout_sessions')
    .select('id, user_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (readErr) {
    return NextResponse.json({ error: readErr.message }, { status: 500 });
  }
  if (!existing || existing.user_id !== patientId) {
    return NextResponse.json({ error: 'Session not found for this patient.' }, { status: 404 });
  }

  const updates = {};

  if (typeof body.title === 'string') {
    const t = body.title.trim();
    if (!t || t.length > 500) {
      return NextResponse.json({ error: 'title must be 1–500 characters.' }, { status: 400 });
    }
    updates.title = t;
  }

  if (body.type != null) {
    updates.type = normalizeType(body.type);
  }

  if (body.status === 'completed' || body.status === 'planned' || body.status === 'cancelled') {
    updates.status = body.status;
  }

  if (typeof body.notes === 'string') {
    updates.notes = body.notes.trim().slice(0, 2000) || null;
  }

  const sportIn = parseSport(body);
  if (sportIn) updates.sport = sportIn;
  if (body.sport === null) updates.sport = null;

  if (body.date != null) {
    const date = typeof body.date === 'string' ? body.date.trim().slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date (YYYY-MM-DD).' }, { status: 400 });
    }
    updates.date = date;
  }

  const dateForSchedule =
    updates.date ||
    (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date.trim())
      ? body.date.trim().slice(0, 10)
      : null);

  if (body.time != null || dateForSchedule) {
    const { data: rowSched } = await supabase
      .from('workout_sessions')
      .select('date, status')
      .eq('id', sessionId)
      .maybeSingle();
    const d = dateForSchedule || rowSched?.date;
    if (d) {
      const time = typeof body.time === 'string' ? body.time.trim() : '09:00';
      const iso = scheduledIsoFromDateAndTime(d, time);
      if (iso) {
        updates.scheduled_at = iso;
        const st = updates.status ?? rowSched?.status;
        if (st === 'completed') {
          updates.completed_at = iso;
        }
      }
    }
  }

  if (typeof body.completed_at === 'string' && body.completed_at) {
    updates.completed_at = body.completed_at;
  }

  if (body.structure != null) {
    if (typeof body.structure !== 'object') {
      return NextResponse.json({ error: 'structure must be an object.' }, { status: 400 });
    }
    const merged = {
      ...body.structure,
      sport: sportIn || body.structure?.sport || undefined,
    };
    const v = validateEnduranceStructure(merged);
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
    updates.structure_json = v.structure;
    if (!sportIn && v.structure?.sport) updates.sport = v.structure.sport;
  }

  if (body.structure === null) {
    updates.structure_json = null;
  }

  if (body.completedMetrics === null) {
    updates.completed_metrics_json = null;
  } else if (body.completedMetrics !== undefined) {
    if (typeof body.completedMetrics !== 'object' || body.completedMetrics === null) {
      return NextResponse.json({ error: 'completedMetrics must be an object or null.' }, { status: 400 });
    }
    updates.completed_metrics_json = sanitizeCompletedMetricsForDb(body.completedMetrics);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('workout_sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', patientId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ev = normalizeCalendarEvent(data);
  return NextResponse.json({ session: data, event: ev });
}
