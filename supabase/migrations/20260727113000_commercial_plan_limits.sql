-- ZAP TMS commercial plans and fair-use limits.
-- Founder keeps the low $29.99 entry point, but no longer means unlimited use.

begin;

alter table public.profiles
  add column if not exists plan text not null default 'founder';

alter table public.profiles
  drop constraint if exists profiles_plan_check;

alter table public.profiles
  add constraint profiles_plan_check
  check (plan in ('founder', 'starter', 'pro', 'premium'));

create or replace function public.plan_limit(p_plan text, p_limit text)
returns integer
language sql
stable
set search_path = public
as $$
  select case
    when p_limit = 'loads_per_month' then
      case p_plan when 'founder' then 100 when 'starter' then 200 when 'pro' then 1000 else null end
    when p_limit = 'carriers' then
      case p_plan when 'founder' then 10 when 'starter' then 25 when 'pro' then 100 else null end
    when p_limit = 'fleet_people' then
      case p_plan when 'founder' then 10 when 'starter' then 25 when 'pro' then 100 else null end
    else null
  end;
$$;

create or replace function public.can_use_feature(p_user_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and public.has_access(p_user_id)
      and (
        p.role = 'admin'
        or p.plan = 'premium'
        or (p_feature = 'ai_ratecon' and p.plan in ('pro', 'premium'))
        or (p_feature = 'eld_hos' and p.plan = 'premium')
      )
  );
$$;

grant execute on function public.can_use_feature(uuid, text) to authenticated;

create or replace function public.assert_plan_allows_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_limit integer;
  v_count integer;
  v_label text;
begin
  select coalesce(p.plan, 'founder')
    into v_plan
  from public.profiles p
  where p.id = new.user_id;

  if v_plan is null then
    v_plan := 'founder';
  end if;

  if tg_table_name = 'loads' then
    v_limit := public.plan_limit(v_plan, 'loads_per_month');
    v_label := 'loads per month';
    select count(*) into v_count
    from public.loads l
    where l.user_id = new.user_id
      and l.created_at >= date_trunc('month', now());
  elsif tg_table_name = 'carriers' then
    v_limit := public.plan_limit(v_plan, 'carriers');
    v_label := 'carriers';
    select count(*) into v_count
    from public.carriers c
    where c.user_id = new.user_id;
  elsif tg_table_name = 'fleet_people' then
    v_limit := public.plan_limit(v_plan, 'fleet_people');
    v_label := 'drivers / owner operators';
    select count(*) into v_count
    from public.fleet_people f
    where f.user_id = new.user_id;
  else
    return new;
  end if;

  if v_limit is not null and v_count >= v_limit then
    raise exception 'Your % plan includes % %. Upgrade to add more.', initcap(v_plan), v_limit, v_label
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_plan_limits_loads on public.loads;
create trigger trg_plan_limits_loads
before insert on public.loads
for each row execute function public.assert_plan_allows_insert();

drop trigger if exists trg_plan_limits_carriers on public.carriers;
create trigger trg_plan_limits_carriers
before insert on public.carriers
for each row execute function public.assert_plan_allows_insert();

drop trigger if exists trg_plan_limits_fleet_people on public.fleet_people;
create trigger trg_plan_limits_fleet_people
before insert on public.fleet_people
for each row execute function public.assert_plan_allows_insert();

commit;
