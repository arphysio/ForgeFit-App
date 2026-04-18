-- device_tokens for wearables + Strava.
-- Safe if 20260417150500_create_device_tokens.sql was never applied: creates the table here.
-- If the table already exists (older constraint without strava), widens the provider check.

do $$
declare
  r record;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'device_tokens'
  ) then
    create table public.device_tokens (
      id bigint generated always as identity primary key,
      user_id uuid not null,
      provider text not null
        check (provider in ('garmin', 'fitbit', 'apple', 'whoop', 'strava')),
      access_token text not null,
      refresh_token text,
      expires_at timestamptz,
      metadata jsonb default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    comment on table public.device_tokens is
      'OAuth / API tokens per user and provider (service role writes; users own rows via RLS).';
  else
    for r in
      select c.conname
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on t.relnamespace = n.oid
      where n.nspname = 'public'
        and t.relname = 'device_tokens'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%provider%'
    loop
      execute format('alter table public.device_tokens drop constraint if exists %I', r.conname);
    end loop;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on t.relnamespace = n.oid
      where n.nspname = 'public'
        and t.relname = 'device_tokens'
        and c.conname = 'device_tokens_provider_check'
    ) then
      alter table public.device_tokens
        add constraint device_tokens_provider_check
        check (provider in ('garmin', 'fitbit', 'apple', 'whoop', 'strava'));
    end if;
  end if;
end $$;

create unique index if not exists device_tokens_user_provider_idx
  on public.device_tokens (user_id, provider);

create index if not exists device_tokens_user_idx
  on public.device_tokens (user_id);

create index if not exists device_tokens_provider_idx
  on public.device_tokens (provider);

create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_device_tokens_updated_at on public.device_tokens;
create trigger trg_device_tokens_updated_at
before update on public.device_tokens
for each row
execute function public.set_current_timestamp_updated_at();

alter table public.device_tokens enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_tokens'
      and policyname = 'Users can read own device tokens'
  ) then
    create policy "Users can read own device tokens"
      on public.device_tokens
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_tokens'
      and policyname = 'Users can write own device tokens'
  ) then
    create policy "Users can write own device tokens"
      on public.device_tokens
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
