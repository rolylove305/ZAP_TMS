-- New accounts receive a 15-day application trial. Existing trial end dates
-- are intentionally left unchanged.
alter table public.profiles
  alter column trial_ends_at set default (now() + interval '15 days');
