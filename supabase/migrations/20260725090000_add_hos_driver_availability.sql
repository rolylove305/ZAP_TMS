alter table public.eld_external_drivers
  add column if not exists ready_status text,
  add column if not exists earliest_ready_at timestamptz,
  add column if not exists remaining_off_duty_minutes integer;

comment on column public.eld_external_drivers.ready_status is
  'Dispatcher availability state: ready_now, ready_at, not_resetting, or manual_review.';
comment on column