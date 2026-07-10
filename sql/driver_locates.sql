-- Driver location requests (independent of loads)
-- Run this once in the Supabase SQL Editor before using the Drivers card.

create extension if not exists pgcrypto;

create table if not exists public.driver_locates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  driver_name text not null default '',
  driver_phone text not null default '',
  token uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  latitude double precision,
  longitude double precision,
  located_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.driver_locates enable row level security;

drop policy if exists "driver_locates owner" on public.driver_locates;
create policy "driver_locates owner" on public.driver_locates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Dispatcher creates (or reuses) a locate link for one of their drivers.
create or replace function public.locate_request(p_driver_name text, p_driver_phone text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authorized';
  end if;
  select token into v_token from driver_locates
    where user_id = auth.uid()
      and driver_name = coalesce(p_driver_name,'')
      and driver_phone = coalesce(p_driver_phone,'')
      and active;
  if v_token is null then
    insert into driver_locates(user_id, driver_name, driver_phone)
      values (auth.uid(), coalesce(p_driver_name,''), coalesce(p_driver_phone,''))
      returning token into v_token;
  end if;
  return v_token;
end $$;

-- Driver submits their current position using the token from the link.
create or replace function public.locate_submit(p_token uuid, p_lat double precision, p_lng double precision)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update driver_locates
     set latitude = p_lat, longitude = p_lng, located_at = now()
   where token = p_token and active;
  if not found then
    raise exception 'Invalid link';
  end if;
end $$;

revoke execute on function public.locate_request(text, text) from public, anon;
grant execute on function public.locate_request(text, text) to authenticated;
grant execute on function public.locate_submit(uuid, double precision, double precision) to anon, authenticated;
