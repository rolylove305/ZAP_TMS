-- Driver portal now shows Pickup #/Delivery # and the structured additional stops
-- (jsonb) to the driver. Rate is still never exposed. Applied to the DB 2026-07-12.
drop function if exists public.driver_get_extra(text);
create function public.driver_get_extra(p_token text)
returns table(miles numeric, pickup_address text, delivery_address text, additional_stops text, pickup_number text, delivery_number text, stops jsonb)
language sql security definer set search_path to '"public"'
as $function$
  select l.miles, l.pickup_address, l.delivery_address, l.additional_stops, l.pickup_number, l.delivery_number, coalesce(l.stops,'"[]"'::jsonb)
  from public.driver_links dl join public.loads l on l.id=dl.load_id
  where dl.token=p_token and dl.active=true and (dl.expires_at is null or dl.expires_at > now())
  limit 1;
$function$;
grant execute on function public.driver_get_extra(text) to anon, authenticated;
