create table if not exists public.eld_vehicle_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.eld_connections(id) on delete cascade,
  external_id text,
  vehicle_id text not null,
  driver_external_id text,
  latitude double precision,
  longitude double precision,
  speed double precision,
  bearing text,
  fuel integer,
  odometer double precision,
  engine_hours double precision,
  location_time timestamptz,
  timezone_offset integer,
  geocoded_location text,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, vehicle_id)
);

create index if not exists eld_vehicle_locations_owner_connection_idx
  on public.eld_vehicle_locations(user_id, connection_id);

alter table public.eld_vehicle_locations enable row level security;

create policy "eld_vehicle_locations_select_own"
  on public.eld_vehicle_locations
  for select
  using (auth.uid() = user_id);

create policy "eld_vehicle_locations_insert_own"
  on public.eld_vehicle_locations
  for insert
  with check (auth.uid() = user_id);

create policy "eld_vehicle_locations_update_own"
  on public.eld_vehicle_locations
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "eld_vehicle_locations_delete_own"
  on public.eld_vehicle_locations
  for delete
  using (auth.uid() = user_id);
