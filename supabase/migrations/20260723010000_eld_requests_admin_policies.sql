-- Admin visibility for ELD integration requests.
-- The base policies only let each user see their own rows, so the admin
-- dashboard (authenticated as the admin) needs explicit admin policies.
-- Reuses public.is_admin(uid), the same gate as profiles/comp tables.

drop policy if exists "Admins can view all ELD requests" on public.eld_integration_requests;
create policy "Admins can view all ELD requests"
  on public.eld_integration_requests
  for select
  using (public.is_admin(auth.uid()));

drop policy if exists "Admins can update ELD requests" on public.eld_integration_requests;
create policy "Admins can update ELD requests"
  on public.eld_integration_requests
  for update
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
