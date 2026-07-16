-- ZAP TMS — multi-provider ELD integration foundation.
-- Credentials are encrypted by the Edge Function before storage.

create table if not exists public.eld_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  carrier_id uuid null references public.carriers(id) on delete set null,
  provider text not null,
  display_name text not null,
  account_id text,
  credential_ciphertext text not null,
  credential_iv text not null,
  status text not null default 'pending' check (status in ('pending','connected','error','disabled')),
  last_error text,
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, display_name)
);

create table if not exists public.eld_external_drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.eld_connections(id) on delete cascade,
  external_id text not null,
  driver_name text,
  phone text,
  email text,
  status text,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, external_id)
);

create table if not exists public.eld_external_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.eld_connections(id) on delete cascade,
  device_type text not null check (device_type in ('gps','eld')),
  external_id text not null,
  vehicle_id text,
  serial_number text,
  status text,
  raw_data jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  unique (connection_id, device_type, external_id)
);

create table if not exists public.eld_driver_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  carrier_id uuid null references public.carriers(id) on delete cascade,
  connection_id uuid not null references public.eld_connections(id) on delete cascade,
  load_id uuid null references public.loads(id) on delete set null,
  local_driver_name text,
  external_driver_id text not null,
  external_vehicle_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists eld_connections_user_idx on public.eld_connections(user_id);
create index if not exists eld_connections_carrier_idx on public.eld_connections(carrier_id);
create index if not exists eld_external_drivers_connection_idx on public.eld_external_drivers(connection_id);
create index if not exists eld_external_devices_connection_idx on public.eld_external_devices(connection_id);
create index if not exists eld_driver_mappings_user_idx on public.eld_driver_mappings(user_id);

alter table public.eld_connections enable row level security;
alter table public.eld_external_drivers enable row level security;
alter table public.eld_external_devices enable row level security;
alter table public.eld_driver_mappings enable row level security;

-- The browser may read sanitized connection metadata but never encrypted credentials.
-- The Edge Function uses the service-role client for writes and decryption.
drop policy if exists eld_connections_select_own on public.eld_connections;
create policy eld_connections_select_own on public.eld_connections
  for select using (auth.uid() = user_id);

drop policy if exists eld_connections_delete_own on public.eld_connections;
create policy eld_connections_delete_own on public.eld_connections
  for delete using (auth.uid() = user_id);

drop policy if exists eld_external_drivers_own on public.eld_external_drivers;
create policy eld_external_drivers_own on public.eld_external_drivers
  for select using (auth.uid() = user_id);

drop policy if exists eld_external_devices_own on public.eld_external_devices;
create policy eld_external_devices_own on public.eld_external_devices
  for select using (auth.uid() = user_id);

drop policy if exists eld_driver_mappings_all_own on public.eld_driver_mappings;
create policy eld_driver_mappings_all_own on public.eld_driver_mappings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.touch_eld_connection_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_eld_connection on public.eld_connections;
create trigger trg_touch_eld_connection
before update on public.eld_connections
for each row execute function public.touch_eld_connection_updated_at();
