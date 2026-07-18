alter table public.driver_links add column if not exists expires_at timestamptz;
update public.driver_links set expires_at = now() + interval '30 days' where expires_at is null;;
