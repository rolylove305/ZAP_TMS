-- Remove blanket PUBLIC execute grants; keep explicit anon/authenticated grants where the app needs them.
revoke execute on function public.driver_get_load(text) from public;
revoke execute on function public.driver_get_extra(text) from public;
revoke execute on function public.driver_send_location(text, double precision, double precision, text) from public;
revoke execute on function public.driver_update_status(text, text, double precision, double precision, text) from public;
revoke execute on function public.driver_upload_document(text, text, text, text) from public;
revoke execute on function public.is_email_invited(text) from public;

grant execute on function public.driver_get_load(text) to anon, authenticated;
grant execute on function public.driver_get_extra(text) to anon, authenticated;
grant execute on function public.driver_send_location(text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.driver_update_status(text, text, double precision, double precision, text) to anon, authenticated;
grant execute on function public.driver_upload_document(text, text, text, text) to anon, authenticated;
grant execute on function public.is_email_invited(text) to anon, authenticated;;
