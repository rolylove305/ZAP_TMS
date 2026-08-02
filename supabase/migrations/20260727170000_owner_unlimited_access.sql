-- Zap Dispatch owner access is permanent and independent of customer billing.
-- Keep the existing `admin` role compatible while also supporting a future `owner` role.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('owner', 'admin')
  );
$$;

create or replace function public.has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('owner', 'admin')
        or (
          coalesce(p.is_active, true)
          and (
            coalesce(p.comp_access, false)
            or p.subscription_status = 'active'
            or (p.trial_ends_at is not null and p.trial_ends_at > now())
          )
        )
      )
  );
$$;

-- The original product-owner account remains `admin` internally for compatibility
-- with existing frontend and RLS code. Keep `plan` inside the existing commercial
-- plan check constraint while access/billing are bypassed by role and comp_access.
update public.profiles
set
  is_active = true,
  comp_access = true,
  subscription_status = null,
  trial_ends_at = null,
  plan = 'premium'
where role in ('owner', 'admin');

create or replace function public.normalize_owner_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.role in ('owner', 'admin') then
    new.is_active := true;
    new.comp_access := true;
    new.subscription_status := null;
    new.trial_ends_at := null;
    new.plan := 'premium';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_normalize_owner_profile on public.profiles;
create trigger trg_normalize_owner_profile
before insert or update of role, is_active, comp_access, subscription_status, trial_ends_at, plan
on public.profiles
for each row
execute function public.normalize_owner_profile();

comment on function public.has_access() is
  'Returns true for owner/admin unconditionally; customer access requires active complimentary, subscription, or trial access.';
comment on function public.normalize_owner_profile() is
  'Prevents owner/admin accounts from receiving customer billing, trial, or suspension restrictions while keeping plan compatible with existing constraints.';
