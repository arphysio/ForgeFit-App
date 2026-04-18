-- Patient-reported / clinician-recorded outcome scores (PROMs, NPRS, etc.)
--
-- Run this ENTIRE file in the Supabase SQL Editor (or via `supabase db push`)
-- before running any INSERT into public.patient_outcomes.
--
-- One row = one numeric (or text-only) data point at a point in time.
-- Examples:
--   KOOS: 5 rows per assessment — instrument 'KOOS', subscale 'pain'..'quality_of_life', score 0–100, score_max 100
--   PSFS: one row per activity — instrument 'PSFS', text_value = activity description, score 0–10, score_max 10
--   NPRS: instrument 'NPRS', subscale null, score 0–10, score_max 10

-- Shared trigger helper (same as profiles migration; safe to re-run)
create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.patient_outcomes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  assessed_at timestamptz not null default now(),
  instrument text not null check (
    char_length(trim(instrument)) > 0
    and char_length(instrument) <= 80
  ),
  subscale text,
  score numeric,
  score_max numeric,
  text_value text,
  notes text,
  source text not null default 'clinician' check (
    source in ('clinician', 'patient', 'import', 'device')
  ),
  entered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_outcomes_score_nonneg check (score is null or score >= 0),
  constraint patient_outcomes_score_max_pos check (score_max is null or score_max > 0),
  constraint patient_outcomes_score_vs_max check (
    score is null or score_max is null or score <= score_max
  )
);

comment on table public.patient_outcomes is
  'Outcome measures per patient. Clinician portal / service role can insert any source; patients insert only their own rows with source patient via RLS.';

create index if not exists patient_outcomes_patient_assessed_idx
  on public.patient_outcomes (patient_id, assessed_at desc);

create index if not exists patient_outcomes_patient_instrument_idx
  on public.patient_outcomes (patient_id, instrument, assessed_at desc);

alter table public.patient_outcomes enable row level security;

drop trigger if exists trg_patient_outcomes_updated_at on public.patient_outcomes;
create trigger trg_patient_outcomes_updated_at
before update on public.patient_outcomes
for each row
execute function public.set_current_timestamp_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_outcomes'
      and policyname = 'Patients read own outcomes'
  ) then
    create policy "Patients read own outcomes"
      on public.patient_outcomes
      for select
      using (auth.uid() = patient_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_outcomes'
      and policyname = 'Patients insert own outcomes'
  ) then
    create policy "Patients insert own outcomes"
      on public.patient_outcomes
      for insert
      with check (
        auth.uid() = patient_id
        and source = 'patient'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_outcomes'
      and policyname = 'Patients update own patient-sourced outcomes'
  ) then
    create policy "Patients update own patient-sourced outcomes"
      on public.patient_outcomes
      for update
      using (auth.uid() = patient_id and source = 'patient')
      with check (auth.uid() = patient_id and source = 'patient');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_outcomes'
      and policyname = 'Patients delete own patient-sourced outcomes'
  ) then
    create policy "Patients delete own patient-sourced outcomes"
      on public.patient_outcomes
      for delete
      using (auth.uid() = patient_id and source = 'patient');
  end if;
end $$;

-- Optional: Realtime for live charts in the app (Dashboard → Replication → patient_outcomes).
