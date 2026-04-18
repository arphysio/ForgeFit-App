import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { syncStravaCompletionForUserSession } from '@/lib/calendarStravaSync';
import { normalizeCalendarEvent } from '@/lib/calendarSession';
import { supabase } from '@/lib/supabase';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** POST — clinician: match Strava activity on session date and save completed_metrics_json. */
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
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  if (!isValidUuid(patientId) || !isValidUuid(sessionId)) {
    return NextResponse.json({ error: 'patientId and sessionId must be valid UUIDs.' }, { status: 400 });
  }

  const result = await syncStravaCompletionForUserSession({ userId: patientId, sessionId });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { data: row } = await supabase
    .from('workout_sessions')
    .select()
    .eq('id', sessionId)
    .eq('user_id', patientId)
    .maybeSingle();

  const event = row ? normalizeCalendarEvent(row) : null;
  return NextResponse.json({ ...result, event });
}
