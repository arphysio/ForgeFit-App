-- ForgeFit device tokens for wearable integrations.
-- Run in Supabase SQL editor or via CLI migrations.

create table if not exists public.device_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  provider text not null check (provider in ('garmin', 'fitbit', 'apple', 'whoop')),
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists device_tokens_user_provider_idx
  on public.device_tokens (user_id, provider);

create index if not exists device_tokens_user_idx
  on public.device_tokens (user_id);

create index if not exists device_tokens_provider_idx
  on public.device_tokens (provider);

-- Keep updated_at current.
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

-- RLS policy (recommended if direct client access is ever enabled).
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
