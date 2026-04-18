-- Assigned rehab program (JSON) and clinician-entered pain / session logs per patient.

create table if not exists public.patient_programs (
  patient_id uuid primary key references auth.users (id) on delete cascade,
  program_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.patient_programs is
  'Latest assigned program for a patient (portal writes via service role; patient may read own via RLS).';

create table if not exists public.patient_pain_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references auth.users (id) on delete cascade,
  vas smallint not null check (vas >= 0 and vas <= 10),
  rpe smallint check (rpe is null or (rpe >= 0 and rpe <= 10)),
  session_type text not null default 'run',
  notes text,
  logged_at timestamptz not null default now()
);

create index if not exists patient_pain_logs_patient_logged_idx
  on public.patient_pain_logs (patient_id, logged_at desc);

alter table public.patient_programs enable row level security;
alter table public.patient_pain_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_programs' and policyname = 'Patients read own program'
  ) then
    create policy "Patients read own program"
      on public.patient_programs for select
      using (auth.uid() = patient_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_pain_logs' and policyname = 'Patients read own pain logs'
  ) then
    create policy "Patients read own pain logs"
      on public.patient_pain_logs for select
      using (auth.uid() = patient_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'patient_pain_logs' and policyname = 'Patients insert own pain logs'
  ) then
    create policy "Patients insert own pain logs"
      on public.patient_pain_logs for insert
      with check (auth.uid() = patient_id);
  end if;
end $$;
