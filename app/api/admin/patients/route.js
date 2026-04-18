import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';

/**
 * GET — list patient profiles (all signed-up ForgeFit users).
 * Clinician portal only: requires X-ForgeFit-Portal-Secret.
 *
 * Query: limit (default 200, max 500), offset (default 0)
 */
export async function GET(request) {
  const denied = assertClinicianPortalRequest(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit')) || 200));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  const { data, error, count } = await supabase
    .from('profiles')
    .select('id, display_name, email, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    patients: data ?? [],
    count: count ?? data?.length ?? 0,
    limit,
    offset,
  });
}
