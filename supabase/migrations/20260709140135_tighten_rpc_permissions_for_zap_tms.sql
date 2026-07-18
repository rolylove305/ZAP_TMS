-- Tighten exposed RPC permissions without changing app behavior.
-- Driver portal functions stay callable by anon because public driver links use token-based access.
-- Dispatcher/admin functions require an authenticated session.
-- Internal trigger/event functions are not callable from the API.

create or replace function public.set_owner_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end;
$$;

-- Start from least privilege for exposed functions.
revoke execute on function public.create_driver_link(uuid) from public, anon;
revoke execute on function public.revoke_driver_link(uuid) from public, anon;
revoke execute on function public.get_next_invoice_number() from public, anon;
revoke execute on function public.is_app_invited() from public, anon;
revoke execute on function public.set_owner_user_id() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Authenticated dispatcher app functions.
grant execute on function public.create_driver_link(uuid) to authenticated;
grant execute on function public.revoke_driver_link(uuid) to authenticated;
grant execute on function public.get_next_invoice_number() to authenticated;
grant execute on function public.is_app_invited() to authenticated;

-- Public token-based driver portal functions.
grant execute on function public.driver_get_load(text) to anon, authenticated;
grant execute on function public.driver_get_extra(text) to anon, authenticated;
grant execute on function public.driver_send_location(text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.driver_update_status(text, text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.driver_upload_document(text, text, text, text) to anon, authenticated;

-- Public invite check for the create-user screen.
grant execute on function public.is_email_invited(text) to anon, authenticated;;
