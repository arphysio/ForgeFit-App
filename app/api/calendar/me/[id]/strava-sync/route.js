import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncStravaCompletionForUserSession } from '@/lib/calendarStravaSync';
import { normalizeCalendarEvent } from '@/lib/calendarSession';
import { supabase } from '@/lib/supabase';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** POST — patient pulls best-matching Strava activity for this session’s calendar day. */
export async function POST(_req, { params }) {
  const sessionId = params?.id;
  if (!isValidUuid(sessionId)) {
    return NextResponse.json({ error: 'Invalid session id.' }, { status: 400 });
  }

  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to sync Strava.' }, { status: 401 });
  }

  const result = await syncStravaCompletionForUserSession({ userId: user.id, sessionId });
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { data: row } = await supabase
    .from('workout_sessions')
    .select()
    .eq('id', sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  const event = row ? normalizeCalendarEvent(row) : null;
  return NextResponse.json({ ...result, event });
}
