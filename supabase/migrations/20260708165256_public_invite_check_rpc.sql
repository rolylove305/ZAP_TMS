create or replace function public.is_email_invited(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_invites i
    where lower(i.email::text) = lower(p_email)
      and i.active = true
  );
$$;

grant execute on function public.is_email_invited(text) to anon, authenticated;;
