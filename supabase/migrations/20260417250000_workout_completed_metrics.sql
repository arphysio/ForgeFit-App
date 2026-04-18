-- Actual workout metrics for compliance vs planned structure_json.

alter table public.workout_sessions
  add column if not exists completed_metrics_json jsonb;

comment on column public.workout_sessions.completed_metrics_json is
  'Logged execution vs plan: durationSec, distanceM, tss, intensityFactor, source (manual/strava).';
