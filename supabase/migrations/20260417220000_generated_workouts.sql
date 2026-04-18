-- AI-generated single-session workouts per patient (for progression and audit).

create table if not exists public.generated_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  session_type text not null,
  duration_min int not null,
  target_intensity int not null,
  body_areas jsonb not null default '[]'::jsonb,
  equipment text,
  recovery_score int not null default 70,
  pain_flags jsonb not null default '[]'::jsonb,
  workout_json jsonb not null,
  session_feedback jsonb
);

comment on table public.generated_workouts is
  'Stores each /api/workout generation for signed-in patients; session_feedback holds post-workout RPE/pain/notes for progression.';

create index if not exists generated_workouts_user_created_idx
  on public.generated_workouts (user_id, created_at desc);

alter table public.generated_workouts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generated_workouts'
      and policyname = 'Users read own generated workouts'
  ) then
    create policy "Users read own generated workouts"
      on public.generated_workouts for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generated_workouts'
      and policyname = 'Users insert own generated workouts'
  ) then
    create policy "Users insert own generated workouts"
      on public.generated_workouts for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'generated_workouts'
      and policyname = 'Users update own generated workouts'
  ) then
    create policy "Users update own generated workouts"
      on public.generated_workouts for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
