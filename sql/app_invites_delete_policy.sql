-- Owner-only DELETE policy on app_invites, so the owner can permanently
-- revoke/delete an invitation from the app (the "Delete" button in the
-- Invite Users panel and /invite). Applied to the database on 2026-07-11.
-- app_invites already had insert/update/select policies but no delete,
-- so DELETEs were denied-by-default before this.

drop policy if exists "app_invites_owner_delete" on public.app_invites;
create policy "app_invites_owner_delete" on public.app_invites
  for delete to authenticated
  using (lower(coalesce(auth.jwt()->>'email','')) = 'rolando@zapdispatch.com');
