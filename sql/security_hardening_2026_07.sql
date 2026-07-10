-- Security hardening from the 2026-07-10 RLS audit.
--
-- PART 1 was already applied directly to the database on 2026-07-10:
-- deactivated (active=false) invitees lost residual access to
-- driver_links, driver_locates, load_documents and load_events.
--
-- alter policy "driver_links_owner_all" on public.driver_links to authenticated
--   using (auth.uid() = user_id and is_app_invited())
--   with check (auth.uid() = user_id and is_app_invited());
-- alter policy "driver_locates owner" on public.driver_locates to authenticated
--   using (auth.uid() = user_id and is_app_invited())
--   with check (auth.uid() = user_id and is_app_invited());
-- alter policy "load_documents_dispatch_delete" on public.load_documents
--   using (user_id = auth.uid() and is_app_invited());
-- alter policy "load_documents_owner_insert" on public.load_documents
--   with check (auth.uid() = user_id and is_app_invited());
-- alter policy "load_documents_owner_read" on public.load_documents to authenticated
--   using (auth.uid() = user_id and is_app_invited());
-- alter policy "load_events_owner_read" on public.load_events to authenticated
--   using (auth.uid() = user_id and is_app_invited());

-- PART 2: run AFTER this branch (pw-login.js -> is_email_invited RPC) is live
-- in production. Removes the anonymous read of app_invites that let anyone
-- enumerate the invited emails. Login checks then go only through the
-- is_email_invited(p_email) RPC, which returns just true/false.

drop policy if exists "app_invites_public_active_lookup" on public.app_invites;
