create or replace function public.is_app_invited()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_invites i
    where lower(i.email::text) = lower(coalesce(auth.jwt()->>'email',''))
      and i.active = true
  );
$$;

drop policy if exists app_invites_read_own_or_owner on public.app_invites;
create policy app_invites_read_own_or_owner on public.app_invites
for select to authenticated
using (
  lower(email::text) = lower(coalesce(auth.jwt()->>'email',''))
  or lower(coalesce(auth.jwt()->>'email','')) = 'rolando@zapdispatch.com'
);

drop policy if exists app_invites_owner_insert on public.app_invites;
create policy app_invites_owner_insert on public.app_invites
for insert to authenticated
with check (lower(coalesce(auth.jwt()->>'email','')) = 'rolando@zapdispatch.com');

drop policy if exists app_invites_owner_update on public.app_invites;
create policy app_invites_owner_update on public.app_invites
for update to authenticated
using (lower(coalesce(auth.jwt()->>'email','')) = 'rolando@zapdispatch.com')
with check (lower(coalesce(auth.jwt()->>'email','')) = 'rolando@zapdispatch.com');;
