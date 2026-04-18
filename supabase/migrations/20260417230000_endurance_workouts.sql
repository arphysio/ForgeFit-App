-- Structured run/bike programming (clinic templates + per-session payloads on calendar).

alter table public.workout_sessions
  add column if not exists sport text
    check (sport is null or sport in ('run', 'bike'));

alter table public.workout_sessions
  add column if not exists structure_json jsonb;

comment on column public.workout_sessions.sport is
  'Endurance discipline when type is run/bike; optional for legacy rows.';

comment on column public.workout_sessions.structure_json is
  'ForgeFit interval structure: { version, sport, steps: [...] }. Shown in portal and mapped to Garmin when pushing.';

create index if not exists workout_sessions_sport_idx
  on public.workout_sessions (sport)
  where sport is not null;

-- Clinic-wide template library (read/write only via service-role API routes).
create table if not exists public.endurance_workout_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sport text not null check (sport in ('run', 'bike')),
  structure_json jsonb not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.endurance_workout_templates is
  'Reusable run/bike workout blueprints for the clinician portal.';

create index if not exists endurance_workout_templates_sport_idx
  on public.endurance_workout_templates (sport);

alter table public.endurance_workout_templates enable row level security;

drop trigger if exists trg_endurance_workout_templates_updated_at on public.endurance_workout_templates;
create trigger trg_endurance_workout_templates_updated_at
before update on public.endurance_workout_templates
for each row
execute function public.set_current_timestamp_updated_at();
