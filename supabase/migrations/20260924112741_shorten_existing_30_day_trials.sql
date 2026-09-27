-- Shorten only standard 30-day trials. Paid accounts, admins, and manually
-- customized trial lengths are intentionally excluded. Complimentary access
-- remains effective because it does not depend on trial_ends_at.
update public.profiles
set trial_ends_at = created_at + interval '15 days'
where subscription_status = 'trialing'
  and role <> 'admin'
  and abs(extract(epoch from (
    trial_ends_at - (created_at + interval '30 days')
  ))) < 60;
