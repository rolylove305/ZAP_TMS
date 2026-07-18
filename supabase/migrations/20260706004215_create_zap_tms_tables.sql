create extension if not exists pgcrypto;

create table if not exists public.carriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default '',
  mc_dot text default '',
  contact text default '',
  phone text default '',
  email text default '',
  equipment text default '',
  trucks integer default 1,
  commission numeric default 8,
  created_at timestamptz not null default now()
);

create table if not exists public.brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null default '',
  contact text default '',
  phone text default '',
  email text default '',
  source text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.loads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  carrier text default '',
  broker text default '',
  pickup text default '',
  delivery text default '',
  pickup_date date,
  delivery_date date,
  equipment text default '',
  status text default 'Booked',
  rate numeric default 0,
  commission_pct numeric default 8,
  load_number text default '',
  notes text default '',
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  carrier text default '',
  category text default 'Other',
  amount numeric default 0,
  expense_date date,
  notes text default '',
  created_at timestamptz not null default now()
);;
