import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { normalizeCalendarEvent, sanitizeCompletedMetricsForDb } from '@/lib/calendarSession';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** PATCH — signed-in patient updates completion metrics on their own session. */
export async function PATCH(req, { params }) {
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

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to update your workout.' }, { status: 401 });
  }

  const updates = {};

  if (body.completedMetrics === null) {
    updates.completed_metrics_json = null;
  } else if (body.completedMetrics !== undefined) {
    if (typeof body.completedMetrics !== 'object' || body.completedMetrics === null) {
      return NextResponse.json({ error: 'completedMetrics must be an object or null.' }, { status: 400 });
    }
    updates.completed_metrics_json = sanitizeCompletedMetricsForDb(body.completedMetrics);
  }

  if (body.status === 'completed' || body.status === 'planned' || body.status === 'cancelled') {
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
  }

  const { data, error } = await sb
    .from('workout_sessions')
    .update(updates)
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 });
  }

  const ev = normalizeCalendarEvent(data);
  return NextResponse.json({ session: data, event: ev });
}
