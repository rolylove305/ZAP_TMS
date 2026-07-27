-- ELD/HOS is included from Starter upward.

create or replace function public.can_use_feature(p_user_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and public.has_access(p_user_id)
      and (
        p.role = 'admin'
        or p.plan = 'premium'
        or (p_feature = 'ai_ratecon' and p.plan in ('pro', 'premium'))
        or (p_feature = 'eld_hos' and p.plan in ('starter', 'pro', 'premium'))
      )
  );
$$;

grant execute on function public.can_use_feature(uuid, text) to authenticated;
