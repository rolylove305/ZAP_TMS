-- ============================================================================
-- ZAP-TMS — Free-access invitations: admin pre-authorizes emails so that when
-- that person self-registers they automatically get complimentary (free)
-- access (comp_access=true) and never hit the paywall. Additive + idempotent.
-- ============================================================================

create table if not exists public.comp_invites (
  email       text primary key,
  note        text,
  invited_by  uuid,
  created_at  timestamptz not null default now()
);

alter table public.comp_invites enable row level security;

-- Only admins can see/manage the invite list. The signup trigger reads it as a
-- SECURITY DEFINER function, so it bypasses RLS.
drop policy if exists comp_invites_admin_all on public.comp_invites;
create policy comp_invites_admin_all on public.comp_invites
  for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- On signup, create the profile and grant comp_access if the email was invited.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_comp boolean;
begin
  select exists(
    select 1 from public.comp_invites ci where lower(ci.email) = lower(new.email)
  ) into v_comp;

  insert into public.profiles (id, email, comp_access)
  values (new.id, new.email, coalesce(v_comp, false))
  on conflict (id) do nothing;

  return new;
end;
$$;
-- (trigger on_auth_user_created already calls handle_new_user; no change needed.)
