-- ZAP TMS — Commercial account and tenant-security foundation.
--
-- Every login receives a private home organization. Operational records are
-- scoped to that organization instead of relying only on a user id. Existing
-- rows are backfilled in place; the working subscription, trial and
-- complimentary-invite behavior is preserved.

begin;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null
    check (organization_type in ('dispatch_company', 'carrier_company')),
  home_owner_id uuid unique references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'member'
    check (membership_role in ('owner', 'org_admin', 'dispatcher', 'carrier_manager', 'member')),
  membership_status text not null default 'active'
    check (membership_status in ('active', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- A dispatcher organization may work for several carrier organizations, but
-- the link does not make either company a member of the other company.
create table if not exists public.dispatch_carrier_links (
  id uuid primary key default gen_random_uuid(),
  dispatch_organization_id uuid not null references public.organizations(id) on delete cascade,
  carrier_organization_id uuid not null references public.organizations(id) on delete cascade,
  link_status text not null default 'active'
    check (link_status in ('active', 'revoked')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dispatch_organization_id, carrier_organization_id),
  check (dispatch_organization_id <> carrier_organization_id)
);

create index if not exists organization_memberships_user_idx
  on public.organization_memberships(user_id, membership_status);
create index if not exists dispatch_carrier_links_dispatch_idx
  on public.dispatch_carrier_links(dispatch_organization_id, link_status);
create index if not exists dispatch_carrier_links_carrier_idx
  on public.dispatch_carrier_links(carrier_organization_id, link_status);

alter table public.profiles
  add column if not exists default_organization_id uuid references public.organizations(id) on delete set null;

-- Create one private home organization for every existing account.
insert into public.organizations (
  name,
  organization_type,
  home_owner_id,
  created_by
)
select
  coalesce(
    nullif(split_part(coalesce(p.email, ''), '@', 1), ''),
    'ZAP TMS Company'
  ),
  case when p.account_type = 'carrier' then 'carrier_company' else 'dispatch_company' end,
  p.id,
  p.id
from public.profiles p
where not exists (
  select 1 from public.organizations o where o.home_owner_id = p.id
)
on conflict (home_owner_id) do nothing;

insert into public.organization_memberships (
  organization_id,
  user_id,
  membership_role,
  membership_status,
  invited_by
)
select o.id, o.home_owner_id, 'owner', 'active', o.home_owner_id
from public.organizations o
where o.home_owner_id is not null
on conflict (organization_id, user_id) do update
set membership_role = 'owner',
    membership_status = 'active',
    updated_at = now();

update public.profiles p
set default_organization_id = o.id
from public.organizations o
where o.home_owner_id = p.id
  and p.default_organization_id is null;

create or replace function public.is_organization_member(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.membership_status = 'active'
      and o.is_active = true
  );
$$;

create or replace function public.can_manage_organization(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(p_user_id)
    or exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = p_organization_id
        and m.user_id = p_user_id
        and m.membership_status = 'active'
        and m.membership_role in ('owner', 'org_admin')
    );
$$;

create or replace function public.organization_is_type(
  p_organization_id uuid,
  p_organization_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.organization_type = p_organization_type
      and o.is_active = true
  );
$$;

create or replace function public.current_organization_id(
  p_user_id uuid default auth.uid()
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.default_organization_id
      from public.profiles p
      join public.organization_memberships m
        on m.organization_id = p.default_organization_id
       and m.user_id = p.id
       and m.membership_status = 'active'
      where p.id = p_user_id
      limit 1
    ),
    (
      select m.organization_id
      from public.organization_memberships m
      where m.user_id = p_user_id
        and m.membership_status = 'active'
      order by case m.membership_role when 'owner' then 0 when 'org_admin' then 1 else 2 end,
               m.created_at
      limit 1
    )
  );
$$;

create or replace function public.can_access_organization_row(
  p_organization_id uuid,
  p_legacy_user_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_access(p_user_id)
    and (
      (p_organization_id is not null and public.is_organization_member(p_organization_id, p_user_id))
      or (p_organization_id is null and p_legacy_user_id = p_user_id)
    );
$$;

grant execute on function public.is_organization_member(uuid, uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid, uuid) to authenticated;
grant execute on function public.organization_is_type(uuid, text) to authenticated;
grant execute on function public.current_organization_id(uuid) to authenticated;
grant execute on function public.can_access_organization_row(uuid, uuid, uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.dispatch_carrier_links enable row level security;

drop policy if exists organizations_select_authorized on public.organizations;
create policy organizations_select_authorized on public.organizations
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.is_organization_member(id, auth.uid()));

drop policy if exists organizations_insert_platform_admin on public.organizations;
create policy organizations_insert_platform_admin on public.organizations
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists organizations_update_authorized on public.organizations;
create policy organizations_update_authorized on public.organizations
  for update to authenticated
  using (public.can_manage_organization(id, auth.uid()))
  with check (public.can_manage_organization(id, auth.uid()));

drop policy if exists organizations_delete_platform_admin on public.organizations;
create policy organizations_delete_platform_admin on public.organizations
  for delete to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists memberships_select_self_or_platform_admin on public.organization_memberships;
create policy memberships_select_self_or_platform_admin on public.organization_memberships
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Only the ZAP platform admin can add or remove account memberships. Carrier
-- and dispatcher customers cannot grant themselves access to another company.
drop policy if exists memberships_insert_platform_admin on public.organization_memberships;
create policy memberships_insert_platform_admin on public.organization_memberships
  for insert to authenticated
  with check (public.is_admin(auth.uid()));

drop policy if exists memberships_update_platform_admin on public.organization_memberships;
create policy memberships_update_platform_admin on public.organization_memberships
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists memberships_delete_platform_admin on public.organization_memberships;
create policy memberships_delete_platform_admin on public.organization_memberships
  for delete to authenticated
  using (public.is_admin(auth.uid()));

drop policy if exists dispatch_carrier_links_select_authorized on public.dispatch_carrier_links;
create policy dispatch_carrier_links_select_authorized on public.dispatch_carrier_links
  for select to authenticated
  using (
    public.is_admin(auth.uid())
    or public.is_organization_member(dispatch_organization_id, auth.uid())
    or public.is_organization_member(carrier_organization_id, auth.uid())
  );

drop policy if exists dispatch_carrier_links_write_platform_admin on public.dispatch_carrier_links;
create policy dispatch_carrier_links_write_platform_admin on public.dispatch_carrier_links
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

create or replace function public.protect_organization_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.organization_type is distinct from old.organization_type
    or new.home_owner_id is distinct from old.home_owner_id
  ) and not public.is_admin(auth.uid()) then
    raise exception 'Only the ZAP platform admin can change an account type or owner.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_protect_organization_identity on public.organizations;
create trigger trg_protect_organization_identity
before update on public.organizations
for each row execute function public.protect_organization_identity();

create or replace function public.validate_dispatch_carrier_link()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not public.organization_is_type(new.dispatch_organization_id, 'dispatch_company') then
    raise exception 'The dispatch side must be a dispatch company.';
  end if;
  if not public.organization_is_type(new.carrier_organization_id, 'carrier_company') then
    raise exception 'The carrier side must be a carrier company.';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_validate_dispatch_carrier_link on public.dispatch_carrier_links;
create trigger trg_validate_dispatch_carrier_link
before insert or update on public.dispatch_carrier_links
for each row execute function public.validate_dispatch_carrier_link();

-- The trigger keeps the working free-invite/paywall behavior and now also
-- provisions the new user's private company boundary.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_comp boolean;
  v_account_type text;
  v_organization_type text;
  v_organization_id uuid;
  v_organization_name text;
begin
  select exists (
    select 1 from public.comp_invites ci where lower(ci.email) = lower(new.email)
  ) into v_comp;

  v_account_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'dispatcher'));
  if v_account_type not in ('dispatcher', 'carrier') then
    v_account_type := 'dispatcher';
  end if;

  v_organization_type := case
    when v_account_type = 'carrier' then 'carrier_company'
    else 'dispatch_company'
  end;
  v_organization_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'ZAP TMS Company'
  );

  insert into public.profiles (id, email, comp_access, account_type)
  values (new.id, new.email, coalesce(v_comp, false), v_account_type)
  on conflict (id) do nothing;

  insert into public.organizations (
    name,
    organization_type,
    home_owner_id,
    created_by
  )
  values (
    v_organization_name,
    v_organization_type,
    new.id,
    new.id
  )
  on conflict (home_owner_id) do update
    set organization_type = excluded.organization_type,
        updated_at = now()
  returning id into v_organization_id;

  insert into public.organization_memberships (
    organization_id,
    user_id,
    membership_role,
    membership_status,
    invited_by
  )
  values (v_organization_id, new.id, 'owner', 'active', new.id)
  on conflict (organization_id, user_id) do update
    set membership_role = 'owner',
        membership_status = 'active',
        updated_at = now();

  update public.profiles
  set default_organization_id = v_organization_id
  where id = new.id;

  return new;
end;
$$;

create or replace function public.sync_home_organization_type()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_type is distinct from old.account_type then
    update public.organizations
    set organization_type = case
          when new.account_type = 'carrier' then 'carrier_company'
          else 'dispatch_company'
        end,
        updated_at = now()
    where id = new.default_organization_id
      and home_owner_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_home_organization_type on public.profiles;
create trigger trg_sync_home_organization_type
after update of account_type on public.profiles
for each row execute function public.sync_home_organization_type();

-- Operational records keep user_id for auditing, while organization_id is the
-- actual tenant boundary. The legacy fallback protects any exceptional row
-- that cannot be backfilled without exposing it to another account.
alter table public.carriers
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists linked_carrier_organization_id uuid references public.organizations(id) on delete set null;
alter table public.brokers
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.loads
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict,
  add column if not exists carrier_organization_id uuid references public.organizations(id) on delete set null;
alter table public.expenses
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.fleet_people
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.company_settings
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.invoices
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.load_documents
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.load_events
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.driver_links
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.driver_locates
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.eld_connections
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.eld_driver_mappings
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;
alter table public.eld_vehicle_locations
  add column if not exists organization_id uuid references public.organizations(id) on delete restrict;

alter table public.carriers alter column organization_id set default public.current_organization_id();
alter table public.brokers alter column organization_id set default public.current_organization_id();
alter table public.loads alter column organization_id set default public.current_organization_id();
alter table public.expenses alter column organization_id set default public.current_organization_id();
alter table public.fleet_people alter column organization_id set default public.current_organization_id();
alter table public.company_settings alter column organization_id set default public.current_organization_id();
alter table public.invoices alter column organization_id set default public.current_organization_id();
alter table public.load_documents alter column organization_id set default public.current_organization_id();
alter table public.load_events alter column organization_id set default public.current_organization_id();
alter table public.driver_links alter column organization_id set default public.current_organization_id();
alter table public.driver_locates alter column organization_id set default public.current_organization_id();
alter table public.eld_connections alter column organization_id set default public.current_organization_id();
alter table public.eld_driver_mappings alter column organization_id set default public.current_organization_id();
alter table public.eld_vehicle_locations alter column organization_id set default public.current_organization_id();

update public.carriers t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.brokers t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.loads t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.expenses t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.fleet_people t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.company_settings t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.invoices t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.load_documents t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.load_events t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.driver_links t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.driver_locates t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.eld_connections t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.eld_driver_mappings t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;
update public.eld_vehicle_locations t set organization_id = o.id
from public.organizations o where o.home_owner_id = t.user_id and t.organization_id is null;

create index if not exists carriers_organization_idx on public.carriers(organization_id);
create index if not exists carriers_linked_organization_idx on public.carriers(linked_carrier_organization_id);
create index if not exists brokers_organization_idx on public.brokers(organization_id);
create index if not exists loads_organization_idx on public.loads(organization_id);
create index if not exists loads_carrier_organization_idx on public.loads(carrier_organization_id);
create index if not exists expenses_organization_idx on public.expenses(organization_id);
create index if not exists fleet_people_organization_idx on public.fleet_people(organization_id);

drop policy if exists "carriers owner access" on public.carriers;
drop policy if exists carriers_tenant_access on public.carriers;
create policy carriers_tenant_access on public.carriers
  for all to authenticated
  using (
    public.can_access_organization_row(organization_id, user_id, auth.uid())
    and (
      public.organization_is_type(organization_id, 'dispatch_company')
      or (
        organization_id is null
        and exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.account_type = 'dispatcher'
        )
      )
    )
  )
  with check (
    public.can_access_organization_row(organization_id, user_id, auth.uid())
    and public.organization_is_type(organization_id, 'dispatch_company')
  );

drop policy if exists "brokers owner access" on public.brokers;
drop policy if exists brokers_tenant_access on public.brokers;
create policy brokers_tenant_access on public.brokers
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists "loads owner access" on public.loads;
drop policy if exists loads_tenant_access on public.loads;
create policy loads_tenant_access on public.loads
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists "expenses owner access" on public.expenses;
drop policy if exists expenses_tenant_access on public.expenses;
create policy expenses_tenant_access on public.expenses
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists fleet_people_owner_access on public.fleet_people;
drop policy if exists fleet_people_tenant_access on public.fleet_people;
create policy fleet_people_tenant_access on public.fleet_people
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists company_settings_select_own on public.company_settings;
drop policy if exists company_settings_insert_own on public.company_settings;
drop policy if exists company_settings_update_own on public.company_settings;
drop policy if exists company_settings_tenant_access on public.company_settings;
create policy company_settings_tenant_access on public.company_settings
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists invoices_select_own on public.invoices;
drop policy if exists invoices_insert_own on public.invoices;
drop policy if exists invoices_delete_own on public.invoices;
drop policy if exists invoices_tenant_access on public.invoices;
create policy invoices_tenant_access on public.invoices
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists load_documents_owner_read on public.load_documents;
drop policy if exists load_documents_owner_insert on public.load_documents;
drop policy if exists load_documents_dispatch_delete on public.load_documents;
drop policy if exists load_documents_tenant_access on public.load_documents;
create policy load_documents_tenant_access on public.load_documents
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists load_events_owner_read on public.load_events;
drop policy if exists load_events_tenant_read on public.load_events;
create policy load_events_tenant_read on public.load_events
  for select to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists driver_links_owner_all on public.driver_links;
drop policy if exists driver_links_tenant_access on public.driver_links;
create policy driver_links_tenant_access on public.driver_links
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists "driver_locates owner" on public.driver_locates;
drop policy if exists driver_locates_tenant_access on public.driver_locates;
create policy driver_locates_tenant_access on public.driver_locates
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

-- ELD connection and mapping records use the same company boundary. External
-- driver/device snapshots remain protected through their parent connection.
drop policy if exists eld_connections_select_own on public.eld_connections;
drop policy if exists eld_connections_delete_own on public.eld_connections;
drop policy if exists eld_connections_tenant_select on public.eld_connections;
create policy eld_connections_tenant_select on public.eld_connections
  for select to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()));
drop policy if exists eld_connections_tenant_delete on public.eld_connections;
create policy eld_connections_tenant_delete on public.eld_connections
  for delete to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists eld_driver_mappings_all_own on public.eld_driver_mappings;
drop policy if exists eld_driver_mappings_tenant_access on public.eld_driver_mappings;
create policy eld_driver_mappings_tenant_access on public.eld_driver_mappings
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

drop policy if exists "eld_vehicle_locations_select_own" on public.eld_vehicle_locations;
drop policy if exists "eld_vehicle_locations_insert_own" on public.eld_vehicle_locations;
drop policy if exists "eld_vehicle_locations_update_own" on public.eld_vehicle_locations;
drop policy if exists "eld_vehicle_locations_delete_own" on public.eld_vehicle_locations;
drop policy if exists eld_vehicle_locations_tenant_access on public.eld_vehicle_locations;
create policy eld_vehicle_locations_tenant_access on public.eld_vehicle_locations
  for all to authenticated
  using (public.can_access_organization_row(organization_id, user_id, auth.uid()))
  with check (public.can_access_organization_row(organization_id, user_id, auth.uid()));

commit;
