import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import {
  buildPhaseChartBars,
  computePlannedLoad,
  validateEnduranceStructure,
} from '@/lib/enduranceWorkout';

/** POST — validate structure and return planned load + phase bar data for the portal builder. */
export async function POST(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body.structure !== 'object') {
    return NextResponse.json({ error: 'structure object required.' }, { status: 400 });
  }

  const v = validateEnduranceStructure(body.structure);
  if (v.error) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  const structure = v.structure;
  const plannedLoad = computePlannedLoad(structure);
  const phaseBars = buildPhaseChartBars(structure);

  return NextResponse.json({ plannedLoad, phaseBars, structure });
}
