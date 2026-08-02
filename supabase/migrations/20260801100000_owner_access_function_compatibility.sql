-- Keep Owner/Admin access compatible with every existing RLS helper call.
-- Older policies call public.is_admin(uid) and public.has_access(uid);
-- newer code may call the no-argument helpers.

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
      and p.role in ('owner', 'admin')
  );
$$;

create or replace function public.has_access(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = uid
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(auth.uid());
$$;

create or replace function public.has_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_access(auth.uid());
$$;

grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.has_access(uuid) to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_access() to authenticated;

comment on function public.is_admin(uuid) is
  'Returns true for platform owner/admin roles. Kept for existing RLS policies that pass auth.uid().';
comment on function public.has_access(uuid) is
  'Returns true for owner/admin unconditionally; customer access requires active complimentary, subscription, or trial access.';
