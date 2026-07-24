-- ELD Integration Requests table
create table public.eld_integration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id text not null,
  eld_name text not null,
  eld_website text,
  api_documentation text,
  notes text,
  status text default 'pending' check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Indexes
create index idx_eld_requests_user_id on public.eld_integration_requests(user_id);
create index idx_eld_requests_status on public.eld_integration_requests(status);
create index idx_eld_requests_created on public.eld_integration_requests(created_at desc);

-- RLS Policies
alter table public.eld_integration_requests enable row level security;

create policy "Users can view their own ELD requests"
  on public.eld_integration_requests
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their own ELD requests"
  on public.eld_integration_requests
  for insert
  with check (auth.uid() = user_id);

-- Trigger to update updated_at
create trigger update_eld_requests_timestamp
  before update on public.eld_integration_requests
  for each row
  execute function update_updated_at_column();
