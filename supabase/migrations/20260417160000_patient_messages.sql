-- Secure messaging between clinicians (via server API) and patients (via Supabase client + RLS).

create table if not exists public.patient_messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  sender text not null check (sender in ('clinician', 'patient')),
  body text not null check (char_length(body) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists patient_messages_patient_created_idx
  on public.patient_messages (patient_id, created_at desc);

alter table public.patient_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_messages'
      and policyname = 'Patients read own messages'
  ) then
    create policy "Patients read own messages"
      on public.patient_messages
      for select
      using (auth.uid() = patient_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'patient_messages'
      and policyname = 'Patients insert own messages'
  ) then
    create policy "Patients insert own messages"
      on public.patient_messages
      for insert
      with check (
        auth.uid() = patient_id
        and sender = 'patient'
      );
  end if;
end $$;

-- Optional: Supabase Dashboard → Database → Replication → enable `patient_messages`
-- for Realtime so patients see new clinician messages without refreshing.
