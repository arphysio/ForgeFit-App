import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { normalizeCalendarEvent } from '@/lib/calendarSession';
import { parseCalendarSessionPayload } from '@/lib/calendarCreatePayload';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

const MAX_BATCH = 100;

/** POST — insert many calendar sessions for one patient (clinician portal only). */
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

  const sessionsIn = body.sessions;
  if (!Array.isArray(sessionsIn) || sessionsIn.length === 0) {
    return NextResponse.json({ error: 'Body must include a non-empty sessions array.' }, { status: 400 });
  }
  if (sessionsIn.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `At most ${MAX_BATCH} sessions per request (got ${sessionsIn.length}).` },
      { status: 400 }
    );
  }

  const rows = [];
  for (let i = 0; i < sessionsIn.length; i++) {
    const parsed = parseCalendarSessionPayload(sessionsIn[i]);
    if (parsed.error) {
      return NextResponse.json({ error: `Session ${i}: ${parsed.error}` }, { status: 400 });
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
  return NextResponse.json({ ok: true, inserted: events.length, sessions: data, events });
}
