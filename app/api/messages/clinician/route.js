import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

/** GET — list messages for a patient (newest last for chat UI) */
export async function GET(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get('patientId')?.trim() ?? '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid or missing patientId (Supabase auth user UUID).' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patient_messages')
    .select('id, patient_id, sender, body, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: true })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

/** POST — clinician sends a message to a patient */
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
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!isValidUuid(patientId)) {
    return NextResponse.json({ error: 'Invalid patientId.' }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: 'Message body is required.' }, { status: 400 });
  }
  if (text.length > 8000) {
    return NextResponse.json({ error: 'Message too long (max 8000 characters).' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('patient_messages')
    .insert({ patient_id: patientId, sender: 'clinician', body: text })
    .select('id, patient_id, sender, body, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: data });
}
