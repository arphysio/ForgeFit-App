import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { validateEnduranceStructure } from '@/lib/enduranceWorkout';

function isNonEmptyString(v, max) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return s.length > 0 && s.length <= max;
}

/** GET — list run/bike templates (clinician portal). */
export async function GET(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  try {
    const { data, error } = await supabase
      .from('endurance_workout_templates')
      .select('id, name, sport, structure_json, notes, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: data || [] });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load endurance templates.' },
      { status: 500 }
    );
  }
}

/** POST — save a reusable template. */
export async function POST(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!isNonEmptyString(body.name, 200)) {
    return NextResponse.json({ error: 'name is required (max 200 characters).' }, { status: 400 });
  }

  const sport = body.sport === 'bike' ? 'bike' : 'run';
  const merged = { ...(body.structure || {}), sport };
  const v = validateEnduranceStructure(merged);
  if (v.error) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 2000) : '';

  const { data, error } = await supabase
    .from('endurance_workout_templates')
    .insert({
      name: body.name.trim().slice(0, 200),
      sport,
      structure_json: v.structure,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data });
}
