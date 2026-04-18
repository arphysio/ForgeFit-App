import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { listRacePlanTemplates } from '@/lib/racePlanTemplates';

/** GET — list built-in race / distance plan templates (clinician portal). */
export async function GET(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  void req;
  return NextResponse.json({ plans: listRacePlanTemplates() });
}
