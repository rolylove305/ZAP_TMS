-- Dashboard helper views for Zap TMS.
-- SECURITY INVOKER makes the views respect the underlying table RLS policies.

create or replace view public.load_latest_location
with (security_invoker = true)
as
select distinct on (le.load_id)
  le.user_id,
  le.load_id,
  le.latitude,
  le.longitude,
  le.notes,
  le.created_at as location_at
from public.load_events le
where le.event_type = 'Location'
  and le.latitude is not null
  and le.longitude is not null
order by le.load_id, le.created_at desc;

create or replace view public.load_event_summary
with (security_invoker = true)
as
select
  le.user_id,
  le.load_id,
  count(*)::int as event_count,
  max(le.created_at) as latest_event_at,
  (array_agg(le.event_type order by le.created_at desc))[1] as latest_event_type
from public.load_events le
group by le.user_id, le.load_id;

create or replace view public.load_document_summary
with (security_invoker = true)
as
select
  ld.user_id,
  ld.load_id,
  count(*)::int as document_count,
  max(ld.created_at) as latest_document_at,
  bool_or(
    lower(coalesce(ld.file_name,'')) like '%pod%'
    or lower(coalesce(ld.file_name,'')) like '%bol%'
    or lower(coalesce(ld.file_name,'')) like '%proof%'
    or lower(coalesce(ld.uploaded_by,'')) = 'driver'
  ) as has_driver_document
from public.load_documents ld
group by ld.user_id, ld.load_id;

create or replace view public.loads_dashboard
with (security_invoker = true)
as
select
  l.*,
  coalesce(es.event_count, 0) as event_count,
  es.latest_event_at,
  es.latest_event_type,
  ll.latitude as last_latitude,
  ll.longitude as last_longitude,
  ll.location_at as last_location_at,
  coalesce(ds.document_count, 0) as document_count,
  ds.latest_document_at,
  coalesce(ds.has_driver_document, false) as has_driver_document
from public.loads l
left join public.load_event_summary es on es.load_id = l.id and es.user_id = l.user_id
left join public.load_latest_location ll on ll.load_id = l.id and ll.user_id = l.user_id
left join public.load_document_summary ds on ds.load_id = l.id and ds.user_id = l.user_id;

revoke all on public.load_latest_location from public;
revoke all on public.load_event_summary from public;
revoke all on public.load_document_summary from public;
revoke all on public.loads_dashboard from public;

grant select on public.load_latest_location to authenticated;
grant select on public.load_event_summary to authenticated;
grant select on public.load_document_summary to authenticated;
grant select on public.loads_dashboard to authenticated;;
