alter table public.fleet_people add column if not exists eld_external_driver_id uuid references public.eld_external_drivers(id) on delete set null;
