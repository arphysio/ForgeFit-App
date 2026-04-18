import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decodeFitUploadBuffer } from '@/lib/fitUploadDecode';
import { parseActivityFitSummary } from '@/lib/activityFitSummary';
import { normalizeCalendarEvent, sanitizeCompletedMetricsForDb } from '@/lib/calendarSession';

const MAX_BASE64 = 4_500_000;

/** POST — patient uploads a completed activity .fit / .fit.gz (e.g. Zwift export) as calendar row. */
export async function POST(req) {
  const sb = createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Sign in to import activities.' }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const fileBase64Raw = typeof body.fileBase64 === 'string' ? body.fileBase64.trim() : '';
  if (!fileBase64Raw) {
    return NextResponse.json({ error: 'fileBase64 is required.' }, { status: 400 });
  }

  const comma = fileBase64Raw.indexOf(',');
  const b64 =
    fileBase64Raw.startsWith('data:') && comma !== -1
      ? fileBase64Raw.slice(comma + 1).trim()
      : fileBase64Raw.replace(/\s/g, '');

  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    return NextResponse.json({ error: 'Invalid base64.' }, { status: 400 });
  }
  if (!buf.length) {
    return NextResponse.json({ error: 'Empty file.' }, { status: 400 });
  }
  if (buf.length > MAX_BASE64) {
    return NextResponse.json({ error: 'File too large.' }, { status: 400 });
  }

  const decoded = decodeFitUploadBuffer(buf);
  if (decoded.error) {
    return NextResponse.json({ error: decoded.error }, { status: 400 });
  }

  const summary = await parseActivityFitSummary(decoded);
  if (summary.error) {
    return NextResponse.json({ error: summary.error }, { status: 400 });
  }

  const completedMetrics = sanitizeCompletedMetricsForDb(summary.completedMetrics);
  if (!completedMetrics?.durationSec) {
    return NextResponse.json({ error: 'Could not build completed metrics from FIT.' }, { status: 400 });
  }

  let displayName =
    typeof body.displayName === 'string' ? body.displayName.trim().slice(0, 200) : '';
  if (!displayName) {
    const { data: prof } = await sb.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
    displayName = prof?.display_name || user.email || 'Me';
  }

  const notes =
    typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim().slice(0, 2000)
      : 'Imported from activity FIT (e.g. Zwift export).';

  const row = {
    user_id: user.id,
    patient_name: displayName,
    date: summary.dateYmd,
    scheduled_at: summary.scheduledAt,
    completed_at: summary.scheduledAt,
    type: summary.type,
    title: typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 500) : summary.title,
    status: 'completed',
    notes,
    sport: summary.sport,
    structure_json: null,
    completed_metrics_json: completedMetrics,
  };

  const { data, error } = await sb.from('workout_sessions').insert(row).select().single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const event = normalizeCalendarEvent(data);
  return NextResponse.json({ session: data, event });
}
