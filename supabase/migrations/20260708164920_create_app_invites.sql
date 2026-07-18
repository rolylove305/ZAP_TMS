create extension if not exists citext;

create table if not exists public.app_invites (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  invited_by uuid,
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

alter table public.app_invites enable row level security;

insert into public.app_invites (email, active, note)
values ('rolando@zapdispatch.com', true, 'owner')
on conflict (email) do update set active=true, note='owner';;
