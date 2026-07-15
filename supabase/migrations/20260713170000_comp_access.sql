-- ============================================================================
-- ZAP-TMS — Complimentary access ("comp"): admin can grant free access without
-- a Stripe subscription. Adds profiles.comp_access and wires it into has_access.
-- Additive + idempotent; nobody's access changes (default false).
-- ============================================================================

alter table public.profiles
  add column if not exists comp_access boolean not null default false;

-- has_access = active AND (admin OR comp OR subscribed OR trial valid)
create or replace function public.has_access(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.is_active = true
      and (p.role = 'admin'
           or p.comp_access = true
           or p.subscription_status = 'active'
           or p.trial_ends_at > now())
  );
$$;

-- Verification:
--   select email, role, comp_access, subscription_status, trial_ends_at
--     from public.profiles order by created_at;
