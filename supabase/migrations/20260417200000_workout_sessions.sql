-- Planned / completed workouts and training events for calendar views.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  patient_name text,
  date date not null,
  scheduled_at timestamptz,
  completed_at timestamptz,
  type text not null default 'workout',
  title text not null,
  status text not null default 'planned' check (status in ('planned', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workout_sessions is
  'Calendar events per patient user_id. Clinician portal inserts via service role; patients insert/select own rows via RLS.';

create index if not exists workout_sessions_user_date_idx
  on public.workout_sessions (user_id, date asc);

create index if not exists workout_sessions_date_idx
  on public.workout_sessions (date asc);

alter table public.workout_sessions enable row level security;

drop trigger if exists trg_workout_sessions_updated_at on public.workout_sessions;
create trigger trg_workout_sessions_updated_at
before update on public.workout_sessions
for each row
execute function public.set_current_timestamp_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_sessions'
      and policyname = 'Users read own workout sessions'
  ) then
    create policy "Users read own workout sessions"
      on public.workout_sessions
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_sessions'
      and policyname = 'Users insert own workout sessions'
  ) then
    create policy "Users insert own workout sessions"
      on public.workout_sessions
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_sessions'
      and policyname = 'Users update own workout sessions'
  ) then
    create policy "Users update own workout sessions"
      on public.workout_sessions
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'workout_sessions'
      and policyname = 'Users delete own workout sessions'
  ) then
    create policy "Users delete own workout sessions"
      on public.workout_sessions
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;
