drop policy if exists company_settings_select_own on public.company_settings;
drop policy if exists company_settings_insert_own on public.company_settings;
drop policy if exists company_settings_update_own on public.company_settings;
create policy company_settings_select_own on public.company_settings for select to authenticated using (auth.uid() = user_id and public.is_app_invited());
create policy company_settings_insert_own on public.company_settings for insert to authenticated with check (auth.uid() = user_id and public.is_app_invited());
create policy company_settings_update_own on public.company_settings for update to authenticated using (auth.uid() = user_id and public.is_app_invited()) with check (auth.uid() = user_id and public.is_app_invited());;
