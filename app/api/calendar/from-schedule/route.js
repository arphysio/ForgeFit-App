import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { normalizeCalendarEvent } from '@/lib/calendarSession';
import { parseCalendarSessionPayload } from '@/lib/calendarCreatePayload';
import {
  buildCalendarSessionsFromRacePlan,
  buildCalendarSessionsFromRehabProgram,
} from '@/lib/scheduleProgramToCalendar';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/**
 * POST — build sessions from a rehab program or race-plan template, then insert (portal).
 * Body: { patientId, patientName?, weekAnchorYmd, defaultTime?, source: 'program'|'race_plan',
 *   program?, racePlanId?, weekdayPattern?, thresholdPaceMinPerKm?, ftpWatts? }
 */
export async function POST(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

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

  const patientName =
    typeof body.patientName === 'string' ? body.patientName.trim().slice(0, 200) : '';

  const weekAnchorYmd =
    typeof body.weekAnchorYmd === 'string' ? body.weekAnchorYmd.trim().slice(0, 10) : '';
  const defaultTime =
    typeof body.defaultTime === 'string' && body.defaultTime.trim()
      ? body.defaultTime.trim()
      : '09:00';

  const source = body.source === 'race_plan' ? 'race_plan' : 'program';

  let built;
  if (source === 'race_plan') {
    const racePlanId = typeof body.racePlanId === 'string' ? body.racePlanId.trim() : '';
    if (!racePlanId) {
      return NextResponse.json({ error: 'racePlanId is required when source is race_plan.' }, { status: 400 });
    }
    built = buildCalendarSessionsFromRacePlan(racePlanId, {
      weekAnchorYmd,
      defaultTime,
      thresholdPaceMinPerKm: body.thresholdPaceMinPerKm,
      ftpWatts: body.ftpWatts,
    });
  } else {
    const program = body.program;
    if (!program || typeof program !== 'object' || Array.isArray(program)) {
      return NextResponse.json({ error: 'program object is required when source is program.' }, { status: 400 });
    }
    const weekdayPattern = Array.isArray(body.weekdayPattern) ? body.weekdayPattern : undefined;
    built = buildCalendarSessionsFromRehabProgram(
      program,
      { weekAnchorYmd, defaultTime, weekdayPattern },
      { maxSessions: 80 }
    );
  }

  if (built.error) {
    return NextResponse.json({ error: built.error }, { status: 400 });
  }

  const rows = [];
  for (let i = 0; i < built.sessions.length; i++) {
    const parsed = parseCalendarSessionPayload(built.sessions[i]);
    if (parsed.error) {
      return NextResponse.json({ error: `Built session ${i}: ${parsed.error}` }, { status: 400 });
    }
    rows.push({
      user_id: patientId,
      patient_name: patientName || null,
      date: parsed.date,
      scheduled_at: parsed.scheduledAt,
      completed_at: parsed.status === 'completed' ? parsed.scheduledAt : null,
      type: parsed.type,
      title: parsed.title,
      status: parsed.status,
      notes: parsed.notes || null,
      sport: parsed.sport || null,
      structure_json: parsed.structure_json || null,
    });
  }

  const { data, error } = await supabase.from('workout_sessions').insert(rows).select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const events = (data || []).map(normalizeCalendarEvent).filter(Boolean);
  return NextResponse.json({
    ok: true,
    inserted: events.length,
    meta: built.meta || null,
    sessions: data,
    events,
  });
}
