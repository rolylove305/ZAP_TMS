drop policy if exists app_invites_public_active_lookup on public.app_invites;
create policy app_invites_public_active_lookup on public.app_invites
for select to anon
using (active = true);;
