-- Record when a load is first invoiced and when it is actually paid. The YTD
-- report uses invoiced_at; paid_at remains available to distinguish collections.
alter table public.loads
  add column if not exists invoiced_at timestamptz,
  add column if not exists paid_at timestamptz;

comment on column public.loads.invoiced_at is
  'When the load first entered Invoiced/Paid status or appeared on a saved invoice.';

comment on column public.loads.paid_at is
  'When the load first entered Paid status. Preserved while the paid load is Archived.';

-- Saved invoice history is the best source for the original invoiced date.
-- Status/date fallback also covers older Invoiced/Paid loads whose saved invoice
-- was deleted or created before invoice_loads existed.
update public.loads l
set invoiced_at = coalesce(
  (
    select min(i.created_at)
    from public.invoice_loads il
    join public.invoices i on i.id = il.invoice_id
    where il.load_id = l.id
  ),
  l.delivery_date::timestamp at time zone 'UTC',
  l.pickup_date::timestamp at time zone 'UTC',
  l.created_at
)
where l.invoiced_at is null
  and (
    lower(trim(coalesce(l.status, ''))) in ('invoiced', 'paid')
    or exists (
      select 1
      from public.invoice_loads il
      where il.load_id = l.id
    )
  );

-- Existing Paid loads also predate paid_at. Use the best historical operational
-- date so payment reporting does not start at zero.
update public.loads
set paid_at = coalesce(
  delivery_date::timestamp at time zone 'UTC',
  pickup_date::timestamp at time zone 'UTC',
  created_at
)
where lower(trim(coalesce(status, ''))) = 'paid'
  and paid_at is null;

create or replace function public.track_load_financial_dates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text := lower(trim(coalesce(new.status, '')));
begin
  if tg_op = 'INSERT' then
    new.invoiced_at := case when v_status in ('invoiced', 'paid') then now() else null end;
    new.paid_at := case when v_status = 'paid' then now() else null end;
    return new;
  end if;

  if v_status = 'invoiced' then
    new.invoiced_at := coalesce(old.invoiced_at, now());
    new.paid_at := null;
  elsif v_status = 'paid' then
    new.invoiced_at := coalesce(old.invoiced_at, now());
    new.paid_at := coalesce(old.paid_at, now());
  elsif v_status = 'archived' then
    -- Archiving is filing, not an undo of invoicing or payment.
    new.invoiced_at := old.invoiced_at;
    new.paid_at := old.paid_at;
  else
    -- Moving the load back into an operational status is a correction.
    new.invoiced_at := null;
    new.paid_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_track_load_financial_dates on public.loads;
create trigger trg_track_load_financial_dates
before insert or update of status, invoiced_at, paid_at on public.loads
for each row
execute function public.track_load_financial_dates();

create index if not exists loads_organization_invoiced_at_idx
  on public.loads (organization_id, invoiced_at)
  where invoiced_at is not null;

create index if not exists loads_user_invoiced_at_idx
  on public.loads (user_id, invoiced_at)
  where invoiced_at is not null;

create index if not exists loads_organization_paid_at_idx
  on public.loads (organization_id, paid_at)
  where paid_at is not null;

create index if not exists loads_user_paid_at_idx
  on public.loads (user_id, paid_at)
  where paid_at is not null;
