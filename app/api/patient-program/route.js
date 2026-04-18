import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** GET — latest assigned program JSON for a patient (clinician portal). */
export async function GET(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patientId')?.trim() ?? '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid or missing patientId.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patient_programs')
    .select('program_json, updated_at')
    .eq('patient_id', patientId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    patientId,
    program: data?.program_json ?? null,
    updatedAt: data?.updated_at ?? null,
  });
}

/** POST — upsert assigned program (full JSON document from portal builder). */
export async function POST(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const patientId = typeof body.patientId === 'string' ? body.patientId.trim() : '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid or missing patientId.' }, { status: 400 });
  }

  const program = body.program;
  if (program == null || typeof program !== 'object' || Array.isArray(program)) {
    return NextResponse.json({ error: 'Body must include a program object.' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patient_programs')
    .upsert(
      { patient_id: patientId, program_json: program, updated_at: new Date().toISOString() },
      { onConflict: 'patient_id' }
    )
    .select('patient_id, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, patientId: data.patient_id, updatedAt: data.updated_at });
}
