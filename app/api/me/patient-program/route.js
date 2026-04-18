import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** GET — signed-in patient's assigned program (RLS: own row only). */
export async function GET() {
  try {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Sign in to load your program.' }, { status: 401 });
    }

    const { data, error } = await sb
      .from('patient_programs')
      .select('program_json, updated_at')
      .eq('patient_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      program: data?.program_json ?? null,
      updatedAt: data?.updated_at ?? null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e?.message || 'Failed to load program.' },
      { status: 500 }
    );
  }
}
