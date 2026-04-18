-- Daily recovery aggregates (Garmin / Apple / WHOOP). Used by training guidance and calendar.

create table if not exists public.recovery_data (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  hrv_ms double precision,
  body_battery int,
  sleep_score int,
  whoop_recovery int,
  readiness_score int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

comment on table public.recovery_data is
  'Per-day recovery metrics for training load heuristics. Written by service role jobs; patients read own rows via RLS.';

create index if not exists recovery_data_date_idx on public.recovery_data (date asc);

alter table public.recovery_data enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'recovery_data'
      and policyname = 'Users read own recovery data'
  ) then
    create policy "Users read own recovery data"
      on public.recovery_data
      for select
      using (auth.uid() = user_id);
  end if;
end $$;
