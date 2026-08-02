begin;

create table if not exists public.carrier_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict default public.current_organization_id(),
  carrier_id uuid references public.carriers(id) on delete set null,
  carrier text not null default '',
  carrier_organization_id uuid references public.organizations(id) on delete set null,
  charge_date date not null default current_date,
  category text not null default 'Other Service',
  description text not null default '',
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','invoiced','void')),
  invoice_id uuid references public.invoices(id) on delete set null,
  attachment_bucket text default '',
  attachment_path text default '',
  attachment_name text default '',
  attachment_type text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.carrier_charges enable row level security;

create index if not exists carrier_charges_organization_idx
  on public.carrier_charges(organization_id, status, charge_date);
create index if not exists carrier_charges_carrier_idx
  on public.carrier_charges(carrier_id, status, charge_date);
create index if not exists carrier_charges_carrier_name_idx
  on public.carrier_charges(organization_id, carrier, status);
create index if not exists carrier_charges_invoice_idx
  on public.carrier_charges(invoice_id);
create index if not exists carrier_charges_carrier_organization_idx
  on public.carrier_charges(carrier_organization_id, status);

create or replace function public.touch_carrier_charges_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists carrier_charges_touch_updated_at on public.carrier_charges;
create trigger carrier_charges_touch_updated_at
before update on public.carrier_charges
for each row execute function public.touch_carrier_charges_updated_at();

drop policy if exists carrier_charges_select_authorized on public.carrier_charges;
create policy carrier_charges_select_authorized on public.carrier_charges
  for select to authenticated
  using (
    public.can_access_organization_row(organization_id, user_id, auth.uid())
    or (
      carrier_organization_id is not null
      and public.is_organization_member(carrier_organization_id, auth.uid())
      and public.has_access(auth.uid())
    )
  );

drop policy if exists carrier_charges_insert_dispatch on public.carrier_charges;
create policy carrier_charges_insert_dispatch on public.carrier_charges
  for insert to authenticated
  with check (
    public.can_access_organization_row(organization_id, user_id, auth.uid())
    and public.organization_is_type(organization_id, 'dispatch_company')
  );

drop policy if exists carrier_charges_update_dispatch on public.carrier_charges;
create policy carrier_charges_update_dispatch on public.carrier_charges
  for update to authenticated
  using (
    public.can_access_organization_row(organization_id, user_id, auth.uid())
    and public.organization_is_type(organization_id, 'dispatch_company')
  )
  with check (
    public.can_access_organization_row(organization_id, user_id, auth.uid())
    and public.organization_is_type(organization_id, 'dispatch_company')
  );

drop policy if exists carrier_charges_delete_dispatch on public.carrier_charges;
create policy carrier_charges_delete_dispatch on public.carrier_charges
  for delete to authenticated
  using (
    status = 'pending'
    and public.can_access_organization_row(organization_id, user_id, auth.uid())
    and public.organization_is_type(organization_id, 'dispatch_company')
  );

commit;
