import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { validateEnduranceStructure } from '@/lib/enduranceWorkout';

function isValidUuid(id) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || '').trim());
}

/** PATCH — rename template and/or replace structure / notes. */
export async function PATCH(req, { params }) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  const id = params?.id;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid template id.' }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const updates = {};

  if (typeof body.name === 'string') {
    const n = body.name.trim();
    if (!n) return NextResponse.json({ error: 'name cannot be empty.' }, { status: 400 });
    updates.name = n.slice(0, 200);
  }

  if (typeof body.notes === 'string') {
    updates.notes = body.notes.trim().slice(0, 2000) || null;
  }

  if (body.structure != null && typeof body.structure === 'object') {
    const sport = body.sport === 'bike' ? 'bike' : body.sport === 'run' ? 'run' : undefined;
    const merged = sport ? { ...body.structure, sport } : { ...body.structure };
    const v = validateEnduranceStructure(merged);
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
    updates.structure_json = v.structure;
    updates.sport = v.structure.sport;
  } else if (body.sport === 'bike' || body.sport === 'run') {
    const { data: existing, error: readErr } = await supabase
      .from('endurance_workout_templates')
      .select('structure_json')
      .eq('id', id)
      .maybeSingle();
    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!existing?.structure_json) {
      return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
    }
    const v = validateEnduranceStructure({ ...existing.structure_json, sport: body.sport });
    if (v.error) return NextResponse.json({ error: v.error }, { status: 400 });
    updates.structure_json = v.structure;
    updates.sport = body.sport;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update (name, notes, structure, sport).' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('endurance_workout_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 });
  }

  return NextResponse.json({ template: data });
}

/** DELETE — remove a template. */
export async function DELETE(req, { params }) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  const id = params?.id;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'Invalid template id.' }, { status: 400 });
  }

  const { error } = await supabase.from('endurance_workout_templates').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
