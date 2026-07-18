drop policy if exists "carriers owner access" on public.carriers;
create policy "carriers owner access" on public.carriers
for all to authenticated
using (user_id = auth.uid() and public.is_app_invited())
with check (user_id = auth.uid() and public.is_app_invited());

drop policy if exists "brokers owner access" on public.brokers;
create policy "brokers owner access" on public.brokers
for all to authenticated
using (user_id = auth.uid() and public.is_app_invited())
with check (user_id = auth.uid() and public.is_app_invited());

drop policy if exists "loads owner access" on public.loads;
create policy "loads owner access" on public.loads
for all to authenticated
using (user_id = auth.uid() and public.is_app_invited())
with check (user_id = auth.uid() and public.is_app_invited());;
