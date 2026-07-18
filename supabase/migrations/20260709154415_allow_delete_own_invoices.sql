drop policy if exists invoices_delete_own on public.invoices;
create policy invoices_delete_own
on public.invoices
for delete
to authenticated
using ((auth.uid() = user_id) and is_app_invited());;
