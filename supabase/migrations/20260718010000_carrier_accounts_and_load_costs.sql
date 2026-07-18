-- ZAP TMS — Separate dispatcher/carrier experiences and carrier profitability.
-- Additive migration: existing users remain dispatchers and all paywall,
-- complimentary-access and owner-only RLS behavior stays unchanged.

alter table public.profiles
  add column if not exists account_type text not null default 'dispatcher';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_account_type_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_type_check
      check (account_type in ('dispatcher', 'carrier'));
  end if;
end $$;

-- Preserve the working complimentary-invite behavior while recording the
-- account type selected during signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_comp boolean;
  v_account_type text;
begin
  select exists(
    select 1 from public.comp_invites ci where lower(ci.email) = lower(new.email)
  ) into v_comp;

  v_account_type := lower(coalesce(new.raw_user_meta_data ->> 'account_type', 'dispatcher'));
  if v_account_type not in ('dispatcher', 'carrier') then
    v_account_type := 'dispatcher';
  end if;

  insert into public.profiles (id, email, comp_access, account_type)
  values (new.id, new.email, coalesce(v_comp, false), v_account_type)
  on conflict (id) do nothing;

  return new;
end;
$$;

create table if not exists public.fleet_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_type text not null default 'company_driver'
    check (person_type in ('company_driver', 'owner_operator')),
  name text not null,
  phone text not null default '',
  email text not null default '',
  truck_number text not null default '',
  trailer_number text not null default '',
  equipment text not null default '',
  pay_type text not null default 'per_mile'
    check (pay_type in ('per_mile', 'percentage', 'flat', 'salary')),
  pay_rate numeric not null default 0 check (pay_rate >= 0),
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fleet_people_user_active_idx
  on public.fleet_people(user_id, active);

alter table public.fleet_people enable row level security;

drop policy if exists fleet_people_owner_access on public.fleet_people;
create policy fleet_people_owner_access on public.fleet_people
  for all
  using ((user_id = auth.uid()) and public.has_access(auth.uid()))
  with check ((user_id = auth.uid()) and public.has_access(auth.uid()));

create or replace function public.touch_fleet_people_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_fleet_people on public.fleet_people;
create trigger trg_touch_fleet_people
before update on public.fleet_people
for each row execute function public.touch_fleet_people_updated_at();

alter table public.loads
  add column if not exists fleet_person_id uuid references public.fleet_people(id) on delete set null,
  add column if not exists fuel_cost numeric not null default 0 check (fuel_cost >= 0),
  add column if not exists driver_cost numeric not null default 0 check (driver_cost >= 0),
  add column if not exists tolls_cost numeric not null default 0 check (tolls_cost >= 0),
  add column if not exists maintenance_cost numeric not null default 0 check (maintenance_cost >= 0),
  add column if not exists other_cost numeric not null default 0 check (other_cost >= 0);

create index if not exists loads_fleet_person_idx on public.loads(fleet_person_id);
