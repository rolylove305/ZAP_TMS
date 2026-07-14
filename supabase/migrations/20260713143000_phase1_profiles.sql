-- ============================================================================
-- ZAP-TMS — FASE 1: tabla `profiles` + trigger + backfill
-- Base para: registro abierto, trial de 30 días, rol admin, y paywall vía RLS.
-- Idempotente (seguro de re-correr) EXCEPTO el bloque 6 (backfill), que es
-- ONE-TIME: correr una sola vez, ANTES de abrir el registro público.
-- Esta fase NO cambia el RLS de las demás tablas (eso es la Fase 3).
-- ============================================================================

-- 1) Enum de estado de suscripción -------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('trialing','active','past_due','canceled');
  end if;
end $$;

-- 2) Tabla profiles (1:1 con auth.users) -------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  email                 text,
  role                  text not null default 'user',            -- 'user' | 'admin'
  is_active             boolean not null default true,            -- el admin puede desactivar/expulsar
  trial_ends_at         timestamptz not null default (now() + interval '30 days'),
  subscription_status   public.subscription_status not null default 'trialing',
  stripe_customer_id    text,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 3) Helpers (SECURITY DEFINER -> evitan recursión de RLS) --------------------
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$;

-- Función maestra de acceso. Se enchufará al RLS de las demás tablas en la Fase 3.
-- Dueño (admin) OR (activo Y (suscrito O trial vigente)).
create or replace function public.has_access(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid
      and p.is_active = true
      and (p.role = 'admin'
           or p.subscription_status = 'active'
           or p.trial_ends_at > now())
  );
$$;

-- 4) Trigger: crear profile automáticamente al registrarse (trial de 30 días) -
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5) RLS de la tabla profiles ------------------------------------------------
-- INSERT lo hace el trigger (security definer); el webhook de Stripe usará service_role.
-- El usuario NO puede tocar su propio subscription_status / role / trial (seguridad).
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_admin_only" on public.profiles;
create policy "profiles_update_admin_only" on public.profiles
  for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- 6) BACKFILL — *** CORRER UNA SOLA VEZ, antes de abrir el registro *** -------
-- 6a) Crea profiles para los usuarios que YA existen en auth.users
insert into public.profiles (id, email, created_at)
select u.id, u.email, u.created_at
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- 6b) El dueño = admin con acceso permanente
update public.profiles
set role = 'admin', is_active = true, subscription_status = 'active'
where lower(email) = 'rolando@zapdispatch.com';

-- 6c) Cualquier otro usuario preexistente = 'active' (comped) para no perder acceso.
--     (Red de seguridad; si ya removiste a todos, no afecta a nadie.)
update public.profiles
set subscription_status = 'active'
where lower(email) <> 'rolando@zapdispatch.com';

-- 7) Verificación (solo lectura) ---------------------------------------------
-- select email, role, is_active, subscription_status, trial_ends_at, created_at
--   from public.profiles order by created_at;
