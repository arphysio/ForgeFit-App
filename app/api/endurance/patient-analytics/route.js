import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { supabase } from '@/lib/supabase';
import { buildPatientTrainingGuidancePack } from '@/lib/trainingLoadRecommendations';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** GET — CardioFit load / adherence trends for a patient (clinician portal). */
export async function GET(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const patientId = String(searchParams.get('patientId') || '').trim();
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'patientId query must be a valid UUID.' }, { status: 400 });
  }

  let weeks = parseInt(searchParams.get('weeks') || '8', 10);
  if (!Number.isFinite(weeks) || weeks < 1) weeks = 8;
  if (weeks > 52) weeks = 52;

  const start = new Date();
  start.setUTCDate(start.getUTCDate() - weeks * 7);
  const startStr = start.toISOString().slice(0, 10);

  const [{ data, error }, recRes] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select(
        'id, date, title, type, sport, status, structure_json, completed_metrics_json, scheduled_at, completed_at'
      )
      .eq('user_id', patientId)
      .gte('date', startStr)
      .order('date', { ascending: true }),
    supabase
      .from('recovery_data')
      .select('date, hrv_ms, sleep_score, readiness_score, whoop_recovery')
      .eq('user_id', patientId)
      .gte('date', startStr)
      .order('date', { ascending: true }),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ref = String(searchParams.get('ref') || '')
    .trim()
    .slice(0, 10);
  const referenceDate = /^\d{4}-\d{2}-\d{2}$/.test(ref) ? ref : undefined;

  const pack = buildPatientTrainingGuidancePack(data || [], recRes.data || [], {
    weeks,
    referenceDate,
  });

  return NextResponse.json({
    patientId,
    recoveryRowCount: Array.isArray(recRes.data) ? recRes.data.length : 0,
    recoveryQueryError: recRes.error?.message ?? null,
    ...pack,
  });
}
