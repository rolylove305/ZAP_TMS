alter table public.driver_links alter column expires_at set default (now() + interval '30 days');;
