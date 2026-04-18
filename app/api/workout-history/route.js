import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapGeneratedRowToSavedSummary, mapGeneratedRowToUserHistory } from '@/lib/generatedWorkoutHistory';

const MAX_ROWS = 24;

function normalizeBodyAreas(bodyAreas) {
  if (Array.isArray(bodyAreas)) return bodyAreas.map((s) => String(s).trim()).filter(Boolean);
  if (typeof bodyAreas === 'string') {
    return bodyAreas
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** GET — recent generations as userHistory-shaped entries (newest first). */
export async function GET() {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to load workout history.' }, { status: 401 });
    }

    const { data, error } = await sb
      .from('generated_workouts')
      .select(
        'id, created_at, session_type, duration_min, target_intensity, body_areas, equipment, recovery_score, pain_flags, workout_json, session_feedback'
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];
    const history = rows.map((row) => mapGeneratedRowToUserHistory(row));
    const savedWorkouts = rows.map((row) => mapGeneratedRowToSavedSummary(row));

    return NextResponse.json({ history, savedWorkouts });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Failed to load history.' }, { status: 500 });
  }
}

/** POST — persist one AI generation (after /api/workout returns). */
export async function POST(request) {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to save workouts to your profile.' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const workout = body.workout;
    if (!workout || typeof workout !== 'object' || Array.isArray(workout)) {
      return NextResponse.json({ error: 'Body must include a workout object.' }, { status: 400 });
    }

    const sessionType = String(body.sessionType || 'Strength').slice(0, 120);
    const durationMin = Math.round(Number(body.duration));
    const targetIntensity = Math.round(Number(body.intensity));
    if (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 180) {
      return NextResponse.json({ error: 'Invalid duration.' }, { status: 400 });
    }
    if (!Number.isFinite(targetIntensity) || targetIntensity < 1 || targetIntensity > 10) {
      return NextResponse.json({ error: 'Invalid intensity.' }, { status: 400 });
    }

    const bodyAreas = normalizeBodyAreas(body.bodyAreas);
    const equipment = typeof body.equipment === 'string' ? body.equipment.slice(0, 2000) : '';
    const recoveryScore = Math.round(Number(body.recoveryScore ?? 70));
    const painFlags = Array.isArray(body.painFlags) ? body.painFlags : [];

    const { data, error } = await sb
      .from('generated_workouts')
      .insert({
        user_id: user.id,
        session_type: sessionType,
        duration_min: durationMin,
        target_intensity: targetIntensity,
        body_areas: bodyAreas,
        equipment,
        recovery_score: Number.isFinite(recoveryScore) ? Math.min(100, Math.max(0, recoveryScore)) : 70,
        pain_flags: painFlags,
        workout_json: workout,
      })
      .select('id')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Failed to save workout.' }, { status: 500 });
  }
}

/** PATCH — attach completion feedback to a saved generation (same user only). */
export async function PATCH(request) {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to update workout history.' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return NextResponse.json({ error: 'Invalid id.' }, { status: 400 });
    }

    let rpe = body.rpe;
    if (rpe === '' || rpe === undefined) rpe = null;
    else {
      rpe = Number(rpe);
      if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) {
        return NextResponse.json({ error: 'rpe must be 0–10 or null.' }, { status: 400 });
      }
    }

    let painScore = body.pain_score;
    if (painScore === '' || painScore === undefined) painScore = 0;
    else {
      painScore = Number(painScore);
      if (!Number.isFinite(painScore) || painScore < 0 || painScore > 10) {
        return NextResponse.json({ error: 'pain_score must be 0–10.' }, { status: 400 });
      }
    }

    const painLocation =
      painScore > 0 && typeof body.pain_location === 'string' ? body.pain_location.trim().slice(0, 500) : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 4000) : '';

    const session_feedback = {
      logged_at: new Date().toISOString(),
      rpe,
      pain_score: painScore,
      pain_location: painLocation || null,
      notes,
    };

    const { data, error } = await sb
      .from('generated_workouts')
      .update({ session_feedback })
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Workout not found or access denied.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Failed to update workout.' }, { status: 500 });
  }
}
