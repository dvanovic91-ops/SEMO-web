-- =============================================================================
-- 주문 INSERT RLS — auth.users.email_confirmed_at 기준 (가입 시 이메일 확인)
-- Supabase Dashboard → Authentication → «Confirm email» 켜기.
-- 이전: profiles.email_verified_at + 매직링크 RPC — 이 스크립트로 주문 게이트만 교체 가능.
-- =============================================================================

create or replace function public.current_user_is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (p.is_admin = true or p.is_manager = true) from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.profile_has_order_email_verified()
returns boolean
language sql
stable
security definer
set search_path = auth
as $$
  select coalesce(
    (select u.email_confirmed_at is not null from auth.users u where u.id = auth.uid()),
    false
  );
$$;

revoke all on function public.profile_has_order_email_verified() from public;
grant execute on function public.profile_has_order_email_verified() to authenticated;
grant execute on function public.profile_has_order_email_verified() to service_role;

comment on function public.profile_has_order_email_verified() is
  '주문 INSERT: auth.users.email_confirmed_at IS NOT NULL';

drop policy if exists "orders_insert_own_email_verified" on public.orders;
drop policy if exists "orders_insert_own_profile_email_verified" on public.orders;

create policy "orders_insert_own_email_verified"
  on public.orders
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.profile_has_order_email_verified()
      or public.current_user_is_admin_or_manager()
    )
  );
