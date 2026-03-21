-- =============================================================================
-- orders INSERT RLS — profiles.email_verified_at 기준 (프론트 isEmailConfirmed 와 동일)
--
-- auth.users.email_confirmed_at 만 쓰면 Supabase「Confirm email」OFF 일 때
-- 가입 직후 전원 인증된 것처럼 보이므로 주문·UI는 profiles 컬럼만 사용합니다.
-- (OAuth 가입은 handle_new_user 에서 email_verified_at 자동 설정됨)
--
-- 선행: public.current_user_is_admin_or_manager()
--       profiles.email_verified_at 컬럼(SUPABASE_CHECKOUT_EMAIL_VERIFICATION.sql)
--
-- Supabase SQL Editor에서 한 번 실행
-- =============================================================================

create or replace function public.profile_has_order_email_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.email_verified_at is not null from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.profile_has_order_email_verified() from public;
grant execute on function public.profile_has_order_email_verified() to authenticated;
grant execute on function public.profile_has_order_email_verified() to service_role;

comment on function public.profile_has_order_email_verified() is
  '주문 INSERT: profiles.email_verified_at 존재 여부 (Auth email_confirmed_at 과 별개)';

drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "orders_insert_own_email_verified" on public.orders;
drop policy if exists "orders_insert_own_auth_email_confirmed" on public.orders;

create policy "orders_insert_own_profile_email_verified"
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

comment on policy "orders_insert_own_profile_email_verified" on public.orders is
  '일반 사용자: 본인 주문 + profiles.email_verified_at. 관리자/매니저 예외.';
