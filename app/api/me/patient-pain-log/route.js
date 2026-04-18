import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_TYPES = new Set(['run', 'gym', 'rehab', 'appt', 'workout', 'other']);

/** GET — patient's own pain / session logs (newest first). */
export async function GET(req) {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '40', 10) || 40));

    const { data, error } = await sb
      .from('patient_pain_logs')
      .select('id, vas, rpe, session_type, notes, logged_at')
      .eq('patient_id', user.id)
      .order('logged_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ logs: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Failed to load logs.' }, { status: 500 });
  }
}

/** POST — patient logs a check-in (VAS, optional RPE, notes). */
export async function POST(req) {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const vas = Number(body.vas);
    if (!Number.isInteger(vas) || vas < 0 || vas > 10) {
      return NextResponse.json({ error: 'vas must be an integer 0–10.' }, { status: 400 });
    }

    let rpe = body.rpe == null || body.rpe === '' ? null : Number(body.rpe);
    if (rpe != null && (!Number.isInteger(rpe) || rpe < 0 || rpe > 10)) {
      return NextResponse.json({ error: 'rpe must be 0–10 or omitted.' }, { status: 400 });
    }

    const sessionTypeRaw = String(body.sessionType || 'run').toLowerCase().trim();
    const session_type = ALLOWED_TYPES.has(sessionTypeRaw) ? sessionTypeRaw : 'run';

    const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 4000) : '';

    const { data, error } = await sb
      .from('patient_pain_logs')
      .insert({
        patient_id: user.id,
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
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Failed to save log.' }, { status: 500 });
  }
}
