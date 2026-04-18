import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getMonthRange, normalizeCalendarEvent } from '@/lib/calendarSession';

/** GET — signed-in patient's sessions for a month (no portal secret). */
export async function GET(req) {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to view your calendar.' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
    const range = getMonthRange(month);
    if (!range) {
      return NextResponse.json({ error: 'Invalid month format. Use YYYY-MM.' }, { status: 400 });
    }

    const { data, error } = await sb
      .from('workout_sessions')
      .select(
        'id, user_id, patient_name, date, scheduled_at, completed_at, type, title, status, sport, structure_json, notes, completed_metrics_json'
      )
      .eq('user_id', user.id)
      .gte('date', range.startDate)
      .lte('date', range.endDate)
      .order('date', { ascending: true })
      .order('scheduled_at', { ascending: true, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const events = (data || []).map(normalizeCalendarEvent).filter(Boolean);

    return NextResponse.json({
      month: range.month,
      events,
      healthByDate: {},
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load calendar.' },
      { status: 500 }
    );
  }
}
