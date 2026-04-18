import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { getProviderAccessToken } from '@/lib/deviceTokens';
import {
  stravaCreateManualActivity,
  forgeFitToStravaSportType,
  totalSecondsFromStructure,
  totalMetersFromStructure,
} from '@/lib/strava';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

function toLocalIsoNoZ(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * POST — create a manual Strava activity for a patient (OAuth token in device_tokens).
 * Body: { patientId, sessionId } to derive from workout_sessions, or explicit activity fields.
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

  const token = await getProviderAccessToken(patientId, 'strava');
  if (!token) {
    return NextResponse.json(
      {
        error:
          'No Strava token for this patient. They must connect Strava under Integrations (ForgeFit web) using their Supabase user ID.',
      },
      { status: 400 }
    );
  }

  let name;
  let sport_type;
  let start_date_local;
  let elapsed_time;
  let distance;
  let description;

  if (body.sessionId) {
    const sid = String(body.sessionId).trim();
    if (!isValidUuid(sid)) {
      return NextResponse.json({ error: 'Invalid sessionId.' }, { status: 400 });
    }

    const { data: row, error } = await supabase
      .from('workout_sessions')
      .select(
        'id, user_id, title, type, sport, status, scheduled_at, completed_at, notes, structure_json'
      )
      .eq('id', sid)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!row || row.user_id !== patientId) {
      return NextResponse.json({ error: 'Session not found for this patient.' }, { status: 404 });
    }

    name = row.title || 'Workout';
    sport_type = forgeFitToStravaSportType(row.type, row.sport);
    const when = row.completed_at || row.scheduled_at;
    start_date_local = toLocalIsoNoZ(when) || toLocalIsoNoZ(new Date().toISOString());
    elapsed_time =
      totalSecondsFromStructure(row.structure_json) ||
      (row.status === 'completed' ? 1800 : 600);
    distance = totalMetersFromStructure(row.structure_json);
    const parts = ['Logged from ForgeFit calendar.'];
    if (row.notes) parts.push(String(row.notes).slice(0, 1500));
    description = parts.join('\n\n');
  } else {
    name = typeof body.name === 'string' ? body.name.trim() : '';
    sport_type = typeof body.sport_type === 'string' ? body.sport_type.trim() : 'Workout';
    start_date_local = typeof body.start_date_local === 'string' ? body.start_date_local.trim() : '';
    elapsed_time = Number(body.elapsed_time);
    if (!name || !start_date_local) {
      return NextResponse.json(
        { error: 'Provide sessionId, or name + start_date_local + elapsed_time.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(elapsed_time) || elapsed_time < 1) {
      return NextResponse.json({ error: 'elapsed_time must be a positive number (seconds).' }, { status: 400 });
    }
    distance = body.distance_m != null ? Number(body.distance_m) : null;
    description = typeof body.description === 'string' ? body.description.trim().slice(0, 2000) : '';
  }

  try {
    const activity = await stravaCreateManualActivity(token, {
      name,
      sport_type,
      type: sport_type,
      start_date_local,
      elapsed_time,
      distance: distance != null && Number.isFinite(distance) ? distance : undefined,
      description,
    });
    return NextResponse.json({ success: true, activity });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Strava activity creation failed.' },
      { status: 500 }
    );
  }
}
