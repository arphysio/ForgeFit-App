import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { aggregateDailyRecovery } from '@/lib/recovery';

function utcDateString(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

/**
 * POST — pull Garmin / Apple (stub) / WHOOP for one patient-day into `recovery_data`.
 * Clinician portal: X-ForgeFit-Portal-Secret.
 *
 * Body: { patientId: string (uuid), date?: "YYYY-MM-DD" } — date defaults to today UTC.
 */
export async function POST(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const patientId = typeof body?.patientId === 'string' ? body.patientId.trim() : '';
  if (!patientId) {
    return NextResponse.json({ error: 'Missing patientId' }, { status: 400 });
  }

  const date =
    typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : utcDateString();

  try {
    const row = await aggregateDailyRecovery(patientId, date);
    return NextResponse.json({ ok: true, date, patientId, row });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Recovery sync failed' },
      { status: 500 }
    );
  }
}
