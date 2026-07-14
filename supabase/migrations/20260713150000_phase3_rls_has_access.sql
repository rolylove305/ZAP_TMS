-- ============================================================================
-- ZAP-TMS — FASE 3: RLS is_app_invited()  ->  has_access(auth.uid())
-- Refuerza el paywall EN EL SERVIDOR: la BD niega los datos cuando el trial
-- caduca y no hay suscripción activa (o el admin desactivó al usuario).
-- Se conserva el chequeo de propiedad (user_id = auth.uid()) tal cual.
--
-- Requiere la Fase 1 (has_access() ya existe). Transaccional: todo o nada.
-- SEGURO para usuarios actuales: todos pasan has_access() (admin/active),
-- así que nadie pierde acceso. Solo cambia el gate de "invitado" por "acceso".
-- ============================================================================

begin;

-- loads ----------------------------------------------------------------------
drop policy if exists "loads owner access" on public.loads;
create policy "loads owner access" on public.loads
  for all
  using ((user_id = auth.uid()) and public.has_access(auth.uid()))
  with check ((user_id = auth.uid()) and public.has_access(auth.uid()));

-- carriers -------------------------------------------------------------------
drop policy if exists "carriers owner access" on public.carriers;
create policy "carriers owner access" on public.carriers
  for all
  using ((user_id = auth.uid()) and public.has_access(auth.uid()))
  with check ((user_id = auth.uid()) and public.has_access(auth.uid()));

-- brokers --------------------------------------------------------------------
drop policy if exists "brokers owner access" on public.brokers;
create policy "brokers owner access" on public.brokers
  for all
  using ((user_id = auth.uid()) and public.has_access(auth.uid()))
  with check ((user_id = auth.uid()) and public.has_access(auth.uid()));

-- expenses -------------------------------------------------------------------
drop policy if exists "expenses owner access" on public.expenses;
create policy "expenses owner access" on public.expenses
  for all
  using ((user_id = auth.uid()) and public.has_access(auth.uid()))
  with check ((user_id = auth.uid()) and public.has_access(auth.uid()));

-- company_settings -----------------------------------------------------------
drop policy if exists "company_settings_select_own" on public.company_settings;
create policy "company_settings_select_own" on public.company_settings
  for select using ((auth.uid() = user_id) and public.has_access(auth.uid()));

drop policy if exists "company_settings_insert_own" on public.company_settings;
create policy "company_settings_insert_own" on public.company_settings
  for insert with check ((auth.uid() = user_id) and public.has_access(auth.uid()));

drop policy if exists "company_settings_update_own" on public.company_settings;
create policy "company_settings_update_own" on public.company_settings
  for update
  using ((auth.uid() = user_id) and public.has_access(auth.uid()))
  with check ((auth.uid() = user_id) and public.has_access(auth.uid()));

-- invoices -------------------------------------------------------------------
drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own" on public.invoices
  for select using ((auth.uid() = user_id) and public.has_access(auth.uid()));

drop policy if exists "invoices_insert_own" on public.invoices;
create policy "invoices_insert_own" on public.invoices
  for insert with check ((auth.uid() = user_id) and public.has_access(auth.uid()));

drop policy if exists "invoices_delete_own" on public.invoices;
create policy "invoices_delete_own" on public.invoices
  for delete using ((auth.uid() = user_id) and public.has_access(auth.uid()));

-- load_documents -------------------------------------------------------------
drop policy if exists "load_documents_owner_read" on public.load_documents;
create policy "load_documents_owner_read" on public.load_documents
  for select using ((auth.uid() = user_id) and public.has_access(auth.uid()));

drop policy if exists "load_documents_owner_insert" on public.load_documents;
create policy "load_documents_owner_insert" on public.load_documents
  for insert with check ((auth.uid() = user_id) and public.has_access(auth.uid()));

drop policy if exists "load_documents_dispatch_delete" on public.load_documents;
create policy "load_documents_dispatch_delete" on public.load_documents
  for delete using ((user_id = auth.uid()) and public.has_access(auth.uid()));

-- load_events (solo SELECT tiene policy; INSERT/UPDATE/DELETE siguen denegados)
drop policy if exists "load_events_owner_read" on public.load_events;
create policy "load_events_owner_read" on public.load_events
  for select using ((auth.uid() = user_id) and public.has_access(auth.uid()));

-- driver_links ---------------------------------------------------------------
drop policy if exists "driver_links_owner_all" on public.driver_links;
create policy "driver_links_owner_all" on public.driver_links
  for all
  using ((auth.uid() = user_id) and public.has_access(auth.uid()))
  with check ((auth.uid() = user_id) and public.has_access(auth.uid()));

-- driver_locates -------------------------------------------------------------
drop policy if exists "driver_locates owner" on public.driver_locates;
create policy "driver_locates owner" on public.driver_locates
  for all
  using ((auth.uid() = user_id) and public.has_access(auth.uid()))
  with check ((auth.uid() = user_id) and public.has_access(auth.uid()));

commit;

-- NOTA: invoice_loads NO se toca — su policy usa un EXISTS sobre invoices, que
--       a su vez ya queda protegido por has_access (el RLS de invoices aplica
--       a la subconsulta). Queda protegido de forma transitiva.
-- NOTA: app_invites se deja como está (basado en email del dueño). Queda
--       vestigial una vez abierto el registro, pero es inofensivo.

-- Verificación (correr como TÚ, logueado; deben salir tus filas):
--   select count(*) from public.loads;      -- > 0 si tienes cargas
--   select count(*) from public.brokers;    -- > 0 si tienes brokers
