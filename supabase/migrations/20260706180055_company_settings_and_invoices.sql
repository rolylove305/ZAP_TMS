create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_name text default 'Zap Dispatch',
  logo_url text default '',
  email text default '',
  phone text default '',
  zelle_info text default '',
  default_commission_pct numeric default 8,
  invoice_footer text default 'Thank you for your business.',
  next_invoice_number integer default 1001,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  invoice_number text not null,
  carrier text default '',
  total numeric default 0,
  invoice_date date default current_date,
  created_at timestamptz default now(),
  unique(user_id, invoice_number)
);

create table if not exists public.invoice_loads (
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  load_id uuid not null references public.loads(id) on delete cascade,
  amount_due numeric default 0,
  primary key(invoice_id, load_id)
);

alter table public.company_settings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_loads enable row level security;

drop policy if exists company_settings_select_own on public.company_settings;
create policy company_settings_select_own on public.company_settings
for select using (auth.uid() = user_id);

drop policy if exists company_settings_insert_own on public.company_settings;
create policy company_settings_insert_own on public.company_settings
for insert with check (auth.uid() = user_id);

drop policy if exists company_settings_update_own on public.company_settings;
create policy company_settings_update_own on public.company_settings
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own on public.invoices
for select using (auth.uid() = user_id);

drop policy if exists invoices_insert_own on public.invoices;
create policy invoices_insert_own on public.invoices
for insert with check (auth.uid() = user_id);

drop policy if exists invoice_loads_select_own on public.invoice_loads;
create policy invoice_loads_select_own on public.invoice_loads
for select using (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));

drop policy if exists invoice_loads_insert_own on public.invoice_loads;
create policy invoice_loads_insert_own on public.invoice_loads
for insert with check (exists (select 1 from public.invoices i where i.id = invoice_id and i.user_id = auth.uid()));

create or replace function public.get_next_invoice_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_num integer;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.company_settings(user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select next_invoice_number into v_num
  from public.company_settings
  where user_id = v_user
  for update;

  update public.company_settings
  set next_invoice_number = coalesce(next_invoice_number,1001) + 1,
      updated_at = now()
  where user_id = v_user;

  return 'INV-' || coalesce(v_num,1001)::text;
end;
$$;

grant execute on function public.get_next_invoice_number() to authenticated;;
