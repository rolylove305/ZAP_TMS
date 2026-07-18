drop policy if exists invoices_select_own on public.invoices;
drop policy if exists invoices_insert_own on public.invoices;
create policy invoices_select_own on public.invoices for select to authenticated using (auth.uid() = user_id and public.is_app_invited());
create policy invoices_insert_own on public.invoices for insert to authenticated with check (auth.uid() = user_id and public.is_app_invited());;
