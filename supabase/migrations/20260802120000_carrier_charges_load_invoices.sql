begin;

alter table public.carrier_charges
  add column if not exists load_id uuid references public.loads(id) on delete set null;

create index if not exists carrier_charges_load_idx
  on public.carrier_charges(load_id, status);

create index if not exists carrier_charges_weekly_general_idx
  on public.carrier_charges(organization_id, carrier, status, charge_date)
  where load_id is null;

commit;
