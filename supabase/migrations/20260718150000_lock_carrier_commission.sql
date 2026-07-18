-- The carrier agreement is the only source of truth for dispatch commission.
-- A load snapshots that agreement when it is created. Editing the load cannot
-- silently change the percentage afterward.

alter table public.loads
  add column if not exists carrier_id uuid references public.carriers(id) on delete set null;

create index if not exists loads_carrier_id_idx on public.loads(carrier_id);

-- Attach legacy loads to their saved carrier without changing historical fees.
with matches as (
  select
    l.id as load_id,
    c.id as carrier_id,
    row_number() over (partition by l.id order by c.created_at asc, c.id asc) as match_order
  from public.loads l
  join public.carriers c
    on lower(trim(c.name)) = lower(trim(l.carrier))
   and (
     (l.organization_id is not null and c.organization_id = l.organization_id)
     or (l.organization_id is null and c.organization_id is null and c.user_id = l.user_id)
   )
  where l.carrier_id is null
    and trim(coalesce(l.carrier, '')) <> ''
)
update public.loads l
set carrier_id = m.carrier_id
from matches m
where l.id = m.load_id
  and m.match_order = 1;

-- Normalize only missing/invalid values. Valid historical percentages remain a snapshot.
update public.loads l
set commission_pct = coalesce(c.commission, 0)
from public.carriers c
where l.carrier_id = c.id
  and (l.commission_pct is null or l.commission_pct < 0 or l.commission_pct > 100);

update public.loads
set commission_pct = 0
where commission_pct is null or commission_pct < 0 or commission_pct > 100;

update public.carriers
set commission = 8
where commission is null or commission < 0 or commission > 100;

alter table public.loads alter column commission_pct set not null;
alter table public.carriers alter column commission set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'carriers_commission_valid'
      and conrelid = 'public.carriers'::regclass
  ) then
    alter table public.carriers
      add constraint carriers_commission_valid check (commission between 0 and 100);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'loads_commission_pct_valid'
      and conrelid = 'public.loads'::regclass
  ) then
    alter table public.loads
      add constraint loads_commission_pct_valid check (commission_pct between 0 and 100);
  end if;
end
$$;

create or replace function public.lock_load_commission_to_carrier()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_carrier public.carriers%rowtype;
  v_org_type text;
begin
  -- Ordinary load edits must preserve the original agreed percentage.
  if tg_op = 'UPDATE'
     and new.carrier_id is not distinct from old.carrier_id
     and lower(trim(coalesce(new.carrier, ''))) = lower(trim(coalesce(old.carrier, ''))) then
    new.commission_pct := old.commission_pct;
    return new;
  end if;

  if new.carrier_id is not null then
    select * into v_carrier
    from public.carriers c
    where c.id = new.carrier_id
      and (
        (new.organization_id is not null and c.organization_id = new.organization_id)
        or (new.organization_id is null and c.organization_id is null and c.user_id = new.user_id)
      );
  elsif trim(coalesce(new.carrier, '')) <> '' then
    select * into v_carrier
    from public.carriers c
    where lower(trim(c.name)) = lower(trim(new.carrier))
      and (
        (new.organization_id is not null and c.organization_id = new.organization_id)
        or (new.organization_id is null and c.organization_id is null and c.user_id = new.user_id)
      )
    order by c.created_at asc, c.id asc
    limit 1;
  end if;

  if v_carrier.id is not null then
    if v_carrier.commission is null or v_carrier.commission < 0 or v_carrier.commission > 100 then
      raise exception 'Carrier percentage must be between 0 and 100 before saving a load';
    end if;
    new.carrier_id := v_carrier.id;
    new.carrier := v_carrier.name;
    new.commission_pct := v_carrier.commission;
    return new;
  end if;

  if new.organization_id is not null then
    select o.organization_type into v_org_type
    from public.organizations o
    where o.id = new.organization_id;
  end if;

  if v_org_type = 'dispatch_company' then
    raise exception 'Select a saved carrier with an agreed dispatch percentage';
  end if;

  -- Carrier-company loads have no dispatch carrier agreement.
  new.carrier_id := null;
  new.commission_pct := 0;
  return new;
end
$$;

drop trigger if exists trg_lock_load_commission_to_carrier on public.loads;
create trigger trg_lock_load_commission_to_carrier
before insert or update of carrier_id, carrier, commission_pct on public.loads
for each row execute function public.lock_load_commission_to_carrier();
