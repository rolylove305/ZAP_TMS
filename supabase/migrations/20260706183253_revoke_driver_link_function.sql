create or replace function public.revoke_driver_link(p_load_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.loads where id = p_load_id and user_id = auth.uid();
  if v_user is null then
    raise exception 'Load not found';
  end if;
  update public.driver_links
  set active = false, expires_at = now()
  where user_id = v_user and load_id = p_load_id and active = true;
  return true;
end;
$$;
grant execute on function public.revoke_driver_link(uuid) to authenticated;;
