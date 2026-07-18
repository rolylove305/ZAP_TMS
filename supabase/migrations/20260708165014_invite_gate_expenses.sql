drop policy if exists "expenses owner access" on public.expenses;
create policy "expenses owner access" on public.expenses
for all to authenticated
using (user_id = auth.uid() and public.is_app_invited())
with check (user_id = auth.uid() and public.is_app_invited());;
