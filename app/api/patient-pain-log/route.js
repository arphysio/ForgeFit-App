import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

const ALLOWED_TYPES = new Set(['run', 'gym', 'rehab', 'appt', 'workout', 'other']);

/** GET — pain / session log rows for a patient (newest first). */
export async function GET(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patientId')?.trim() ?? '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid or missing patientId.' }, { status: 400 });
  }

  const limit = Math.min(200, Math.max(1, Number.parseInt(searchParams.get('limit') || '80', 10) || 80));

  const { data, error } = await supabase
    .from('patient_pain_logs')
    .select('id, patient_id, vas, rpe, session_type, notes, logged_at')
    .eq('patient_id', patientId)
    .order('logged_at', { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}

/** POST — append a session log entry. */
export async function POST(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid or missing patientId.' }, { status: 400 });
  }

  const vas = Number(body.vas);
  if (!Number.isInteger(vas) || vas < 0 || vas > 10) {
    return NextResponse.json({ error: 'vas must be an integer 0–10.' }, { status: 400 });
  }

  let rpe = body.rpe == null || body.rpe === '' ? null : Number(body.rpe);
  if (rpe != null && (!Number.isInteger(rpe) || rpe < 0 || rpe > 10)) {
    return NextResponse.json({ error: 'rpe must be an integer 0–10 or omitted.' }, { status: 400 });
  }

  const sessionTypeRaw = String(body.sessionType || 'run').toLowerCase().trim();
  const session_type = ALLOWED_TYPES.has(sessionTypeRaw) ? sessionTypeRaw : 'run';

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 4000) : '';

  const { data, error } = await supabase
    .from('patient_pain_logs')
    .insert({
      patient_id: patientId,
      vas,
      rpe,
      session_type,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ log: data });
}
