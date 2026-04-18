-- Paste this entire file into Supabase → SQL → New query → Run.
-- Requires: public.patient_outcomes exists, and at least one row in auth.users.

-- Uses the oldest auth user in your project (no UUID to copy/paste).
insert into public.patient_outcomes (patient_id, assessed_at, instrument, subscale, score, score_max, source)
select id, now(), 'NPRS', null, 3, 10, 'clinician'
from auth.users
order by created_at asc
limit 1;

-- If you prefer a specific user, comment out the block above and use this instead
-- (replace the UUID with one from Dashboard → Authentication → Users):
--
-- insert into public.patient_outcomes (patient_id, assessed_at, instrument, subscale, score, score_max, source)
-- values
--   ('00000000-0000-0000-0000-000000000000', now(), 'NPRS', null, 3, 10, 'clinician');
