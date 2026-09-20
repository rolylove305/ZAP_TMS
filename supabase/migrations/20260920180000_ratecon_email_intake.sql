-- Rate Con email intake: each user gets a unique inbox code used to build a
-- dedicated forwarding address (code@loads.zapdispatch.com). Cloudflare Email
-- Routing forwards mail sent there to a Worker, which posts attachments to the
-- email-ratecon-intake Edge Function, which resolves the code back to a user.

alter table profiles add column if not exists ratecon_inbox_code text unique;

create or replace function generate_ratecon_inbox_code() returns text as $$
  select lower(encode(gen_random_bytes(8),'hex'));
$$ language sql volatile;
