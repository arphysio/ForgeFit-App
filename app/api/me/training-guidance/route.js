import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildPatientTrainingGuidancePack } from '@/lib/trainingLoadRecommendations';

/** GET — signed-in patient: training load / recovery guidance (RLS on own rows). */
export async function GET(req) {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to load training guidance.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let weeks = parseInt(searchParams.get('weeks') || '8', 10);
    if (!Number.isFinite(weeks) || weeks < 1) weeks = 8;
    if (weeks > 52) weeks = 52;

    const start = new Date();
    start.setUTCDate(start.getUTCDate() - weeks * 7);
    const startStr = start.toISOString().slice(0, 10);

    const ref = String(searchParams.get('ref') || '')
      .trim()
      .slice(0, 10);
    const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : undefined;

    const [{ data: sessions, error: sessErr }, recRes] = await Promise.all([
      sb
        .from('workout_sessions')
        .select(
          'id, date, title, type, sport, status, structure_json, completed_metrics_json, scheduled_at, completed_at'
        )
        .eq('user_id', user.id)
        .gte('date', startStr)
        .order('date', { ascending: true }),
      sb
        .from('recovery_data')
        .select('date, hrv_ms, sleep_score, readiness_score, whoop_recovery')
        .eq('user_id', user.id)
        .gte('date', startStr)
        .order('date', { ascending: true }),
    ]);

    if (sessErr) {
      return NextResponse.json({ error: sessErr.message }, { status: 500 });
    }

    const pack = buildPatientTrainingGuidancePack(sessions || [], recRes.data || [], {
      weeks,
      referenceDate,
    });

    return NextResponse.json({
      recoveryRowCount: Array.isArray(recRes.data) ? recRes.data.length : 0,
      recoveryQueryError: recRes.error?.message ?? null,
      ...pack,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load training guidance.' },
      { status: 500 }
    );
  }
}
