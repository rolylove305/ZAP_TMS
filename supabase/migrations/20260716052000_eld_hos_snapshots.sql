-- Add normalized Next Fleet HOS snapshot fields to synced ELD drivers.
alter table public.eld_external_drivers
  add column if not exists vehicle_id text,
  add column if not exists trailer_id text,
  add column if not exists duty_status text,
  add column if not exists duty_status_duration text,
  add column if not exists break_minutes integer,
  add column if not exists drive_minutes integer,
  add column if not exists shift_minutes integer,
  add column if not exists cycle_minutes integer,
  add column if not exists cycle_tomorrow_minutes integer,
  add column if not exists last_hos_sync text,
  add column if not exists last_activity_at timestamptz,
  add column if not exists hos_synced_at timestamptz;

create index if not exists eld_external_drivers_vehicle_idx
  on public.eld_external_drivers(connection_id, vehicle_id);
