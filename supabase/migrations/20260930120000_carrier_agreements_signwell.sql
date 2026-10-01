-- Carrier agreements via SignWell: each dispatcher connects their own SignWell
-- account (own API key, own template, own billing) and sends their carrier
-- agreement PDF for e-signature directly from the TMS.

create table if not exists signwell_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_ciphertext text not null,
  api_key_iv text not null,
  account_email text,
  template_id text,
  webhook_id text,
  status text not null default 'connected',
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table signwell_connections enable row level security;

create policy "signwell_connections_own_select" on signwell_connections
  for select using (user_id = auth.uid());
create policy "signwell_connections_own_insert" on signwell_connections
  for insert with check (user_id = auth.uid());
create policy "signwell_connections_own_update" on signwell_connections
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "signwell_connections_own_delete" on signwell_connections
  for delete using (user_id = auth.uid());

create table if not exists carrier_agreements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  carrier_id uuid references carriers(id) on delete set null,
  carrier_name text,
  signwell_document_id text,
  status text not null default 'sent',
  sent_at timestamptz not null default now(),
  completed_at timestamptz,
  storage_path text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists carrier_agreements_user_idx on carrier_agreements(user_id);
create index if not exists carrier_agreements_carrier_idx on carrier_agreements(carrier_id);
create index if not exists carrier_agreements_document_idx on carrier_agreements(signwell_document_id);

alter table carrier_agreements enable row level security;

create policy "carrier_agreements_own_select" on carrier_agreements
  for select using (user_id = auth.uid());
create policy "carrier_agreements_own_insert" on carrier_agreements
  for insert with check (user_id = auth.uid());
create policy "carrier_agreements_own_update" on carrier_agreements
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "carrier_agreements_own_delete" on carrier_agreements
  for delete using (user_id = auth.uid());
