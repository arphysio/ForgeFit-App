import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { getProviderAccessToken } from '@/lib/deviceTokens';
import { validateEnduranceStructure, structureToGarminWorkout } from '@/lib/enduranceWorkout';
import { pushWorkoutToGarmin } from '@/lib/garmin';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/**
 * POST — push a structured workout to the patient's Garmin account (OAuth token in device_tokens).
 * Clinician portal only. Apple Watch does not accept structured workouts from a web app; use Garmin or export.
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

  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 200)
      : 'ForgeFit workout';

  let structure = null;

  if (body.templateId) {
    const tid = String(body.templateId).trim();
    if (!isValidUuid(tid)) {
      return NextResponse.json({ error: 'Invalid templateId.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('endurance_workout_templates')
      .select('structure_json')
      .eq('id', tid)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data?.structure_json) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }
    structure = data.structure_json;
  } else if (body.structure && typeof body.structure === 'object') {
    const v = validateEnduranceStructure(body.structure);
    if (v.error) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    structure = v.structure;
  } else {
    return NextResponse.json(
      { error: 'Provide templateId or structure (interval JSON).' },
      { status: 400 }
    );
  }

  const token = await getProviderAccessToken(patientId, 'garmin');
  if (!token) {
    return NextResponse.json(
      {
        error:
          'No Garmin token for this patient. They must sign in to ForgeFit and complete Garmin Connect under Integrations.',
      },
      { status: 400 }
    );
  }

  try {
    const workout = structureToGarminWorkout(structure, title);
    const result = await pushWorkoutToGarmin(token, workout);
    return NextResponse.json({ success: true, result, garminWorkout: workout });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Garmin push failed. Check step targets and patient token scopes.' },
      { status: 500 }
    );
  }
}
