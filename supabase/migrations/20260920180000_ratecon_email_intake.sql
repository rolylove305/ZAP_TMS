-- Rate Con email intake: each user gets a unique inbox code used to build a
-- dedicated forwarding address (code@loads.zapdispatch.com). Cloudflare Email
-- Routing forwards mail sent there to a Worker, which posts attachments to the
-- email-ratecon-intake Edge Function, which resolves the code back to a user.

alter table profiles add column if not exists ratecon_inbox_code text unique;

create or replace function generate_ratecon_inbox_code() returns text as $$
  select lower(encode(gen_random_bytes(8),'hex'));
$$ language sql volatile;

-- profiles UPDATE is admin-only by RLS policy, so a regular user can't set
-- their own inbox code directly. This SECURITY DEFINER function lets them
-- fetch (or lazily create) only that one column on their own row.
create or replace function get_or_create_ratecon_inbox_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
  fresh text;
begin
  select ratecon_inbox_code into existing from profiles where id = auth.uid();
  if existing is not null then
    return existing;
  end if;
  fresh := generate_ratecon_inbox_code();
  update profiles set ratecon_inbox_code = fresh where id = auth.uid();
  return fresh;
end;
$$;

grant execute on function get_or_create_ratecon_inbox_code() to authenticated;
