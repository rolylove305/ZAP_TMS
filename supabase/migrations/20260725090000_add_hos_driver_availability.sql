alter table public.eld_external_drivers
  add column if not exists ready_status text,
  add column if not exists earliest_ready_at timestamptz,
  add column if not exists remaining_off_duty_minutes integer;

comment on column public.eld_external_drivers.ready_status is
  'Dispatcher availability state: ready_now, ready_at, not_resetting, or manual_review.';
comment on column public.eld_external_drivers.earliest_ready_at is
  'Earliest time the current continuous 10-hour off-duty reset completes.';
comment on column public.eld_external_drivers.remaining_off_duty_minutes is
  'Minutes remaining in the current continuous 10-hour off-duty reset.';

create or replace function public.set_eld_driver_hos_availability()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  normalized_status text;
  status_minutes integer;
  remaining_minutes integer;
  calculation_source text;
  availability jsonb;
begin
  normalized_status := upper(regexp_replace(coalesce(new.duty_status, ''), '[[:space:]_-]+', '', 'g'));

  if new.duty_status_duration is not null and new.duty_status_duration > 0 then
    status_minutes := greatest(0, floor(new.duty_status_duration)::integer);
    calculation_source := 'duty_status_duration';
  elsif new.last_activity_at is not null and new.last_activity_at <= clock_timestamp() then
    status_minutes := greatest(
      0,
      floor(extract(epoch from (clock_timestamp() - new.last_activity_at)) / 60)::integer
    );
    calculation_source := 'last_activity_at';
  else
    status_minutes := null;
    calculation_source := 'unavailable';
  end if;

  if normalized_status not in ('OFF', 'OFFDUTY', 'SB', 'SLEEPER', 'SLEEPERBERTH') then
    new.ready_status := 'not_resetting';
    new.earliest_ready_at := null;
    new.remaining_off_duty_minutes := null;
  elsif status_minutes is null then
    new.ready_status := 'manual_review';
    new.earliest_ready_at := null;
    new.remaining_off_duty_minutes := null;
  else
    remaining_minutes := greatest(0, 600 - status_minutes);
    new.remaining_off_duty_minutes := remaining_minutes;

    if remaining_minutes = 0 then
      new.ready_status := 'ready_now';
      new.earliest_ready_at := clock_timestamp();
    else
      new.ready_status := 'ready_at';
      new.earliest_ready_at := clock_timestamp() + make_interval(mins => remaining_minutes);
    end if;

    new.duty_status_duration := status_minutes;
  end if;

  availability := jsonb_build_object(
    'state', new.ready_status,
    'earliest_ready_at', new.earliest_ready_at,
    'remaining_off_duty_minutes', new.remaining_off_duty_minutes,
    'duty_status_duration_minutes', status_minutes,
    'source', calculation_source,
    'split_sleeper_review_required', new.ready_status = 'manual_review',
    'calculated_at', clock_timestamp()
  );

  new.raw_data := coalesce(new.raw_data, '{}'::jsonb) || jsonb_build_object(
    'HosAvailability', availability
  );

  return new;
end;
$$;

drop trigger if exists trg_set_eld_driver_hos_availability
  on public.eld_external_drivers;

create trigger trg_set_eld_driver_hos_availability
before insert or update of duty_status, duty_status_duration, last_activity_at, raw_data
on public.eld_external_drivers
for each row
execute function public.set_eld_driver_hos_availability();

update public.eld_external_drivers
set duty_status = duty_status;

create index if not exists eld_external_drivers_ready_status_idx
  on public.eld_external_drivers (user_id, ready_status, earliest_ready_at);
