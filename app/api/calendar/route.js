import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { createClient } from '@/lib/supabase/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { getMonthRange, normalizeCalendarEvent } from '@/lib/calendarSession';
import { parseCalendarSessionPayload } from '@/lib/calendarCreatePayload';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

async function queryRecoveryData(startDate, endDate) {
  const { data, error } = await supabase
    .from('recovery_data')
    .select('date, hrv_ms, sleep_score, readiness_score, user_id')
    .gte('date', startDate)
    .lte('date', endDate);

  if (error) return [];
  return data || [];
}

async function queryWorkoutSessions(startDate, endDate) {
  const { data, error } = await supabase
    .from('workout_sessions')
    .select(
      'id, user_id, patient_name, date, scheduled_at, completed_at, type, title, status, sport, structure_json, notes, completed_metrics_json'
    )
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true })
    .order('scheduled_at', { ascending: true, nullsFirst: false });

  if (error) return [];
  return data || [];
}

/** GET — month aggregate for clinician portal (requires portal secret). */
export async function GET(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const range = getMonthRange(month);
    if (!range) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
    }

    const [recoveryRows, sessionRows] = await Promise.all([
      queryRecoveryData(range.startDate, range.endDate),
      queryWorkoutSessions(range.startDate, range.endDate),
    ]);

    const healthByDate = {};
    for (const row of recoveryRows) {
      const key = row.date;
      if (!key) continue;
      healthByDate[key] = {
        hrv: row.hrv_ms ?? null,
        sleep: row.sleep_score ?? null,
        recovery: row.readiness_score ?? null,
      };
    }

    const sessions = sessionRows.map(normalizeCalendarEvent).filter(Boolean);

    return NextResponse.json({
      month: range.month,
      events: sessions,
      healthByDate,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load calendar data.' },
      { status: 500 }
    );
  }
}

/** POST — patient (session cookie) adds own event; OR clinician (portal secret) adds for a patient. */
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const parsed = parseCalendarSessionPayload(body);
  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const headerSecret =
    req.headers.get('x-forgefit-portal-secret') ?? req.headers.get('X-ForgeFit-Portal-Secret');
  const isPortalAttempt = Boolean(String(headerSecret || '').trim());

  if (isPortalAttempt) {
    const denied = assertClinicianPortalRequest(req);
    if (denied) return denied;

    const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
    if (!isValidUuid(patientId)) {
      return NextResponse.json({ error: 'Invalid or missing patientId (auth user UUID).' }, { status: 400 });
    }

    const patientName =
      typeof body.patientName === 'string' ? body.patientName.trim().slice(0, 200) : '';

    const row = {
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
    };

    const { data, error } = await supabase.from('workout_sessions').insert(row).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ev = normalizeCalendarEvent(data);
    return NextResponse.json({ session: data, event: ev });
  }

  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to add sessions to your calendar.' }, { status: 401 });
    }

    let displayName =
      typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 200) : '';
    if (!displayName) {
      const { data: prof } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      displayName = prof?.display_name || user.email || 'Me';
    }

    const row = {
      user_id: user.id,
      patient_name: displayName,
      date: parsed.date,
      scheduled_at: parsed.scheduledAt,
      completed_at: parsed.status === 'completed' ? parsed.scheduledAt : null,
      type: parsed.type,
      title: parsed.title,
      status: parsed.status,
      notes: parsed.notes || null,
      sport: parsed.sport || null,
      structure_json: parsed.structure_json || null,
    };

    const { data, error } = await sb.from('workout_sessions').insert(row).select().single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const ev = normalizeCalendarEvent(data);
    return NextResponse.json({ session: data, event: ev });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Failed to create session.' },
      { status: 500 }
    );
  }
}
