-- =============================================================================
-- 개인정보/계정혼선 방지 RLS 하드닝 + 운영 체크
-- 실행 위치: Supabase SQL Editor
-- 목적:
-- 1) 본인 데이터는 본인만 조회/수정
-- 2) 관리자 권한은 필요한 범위에서만 전체 조회/수정
-- 3) 주문 오류(points_used 컬럼 없음) 사전 방지
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) 기존 정책 전부 정리 (중복/충돌 방지)
-- -----------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'orders', 'membership_coupons', 'link_tokens', 'cart_snapshots')
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- A. 권한 함수 (RLS 재귀 방지: SECURITY DEFINER)
-- -----------------------------------------------------------------------------
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

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin = true from public.profiles p where p.id = auth.uid()), false);
$$;

-- -----------------------------------------------------------------------------
-- B. profiles (본인 + 관리자/매니저 조회, 수정은 관리자만)
-- -----------------------------------------------------------------------------
alter table if exists public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
  on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or public.current_user_is_admin_or_manager()
  );

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
  on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id
    or public.current_user_is_admin()
  )
  with check (
    auth.uid() = id
    or public.current_user_is_admin()
  );

-- -----------------------------------------------------------------------------
-- C0. orders 컬럼 보강 (주문 오류 방지)
-- -----------------------------------------------------------------------------
alter table if exists public.orders
  add column if not exists points_used int default 0;

comment on column public.orders.points_used is
  '결제 시 사용한 포인트(코펙). 0이면 미사용';

-- -----------------------------------------------------------------------------
-- C. orders (사용자는 본인 주문만, 관리자/매니저는 전체 조회)
-- -----------------------------------------------------------------------------
alter table if exists public.orders enable row level security;

drop policy if exists "orders_select_own_or_admin" on public.orders;
create policy "orders_select_own_or_admin"
  on public.orders
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin_or_manager()
  );

drop policy if exists "orders_insert_own" on public.orders;
create policy "orders_insert_own"
  on public.orders
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "orders_update_own_or_admin" on public.orders;
create policy "orders_update_own_or_admin"
  on public.orders
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin_or_manager()
  )
  with check (
    user_id = auth.uid()
    or public.current_user_is_admin_or_manager()
  );

-- -----------------------------------------------------------------------------
-- D. membership_coupons (사용자는 본인만 조회/사용, 관리자는 지급)
-- -----------------------------------------------------------------------------
alter table if exists public.membership_coupons enable row level security;

drop policy if exists "membership_coupons_select_own" on public.membership_coupons;
create policy "membership_coupons_select_own"
  on public.membership_coupons
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin_or_manager()
  );

drop policy if exists "membership_coupons_update_own" on public.membership_coupons;
create policy "membership_coupons_update_own"
  on public.membership_coupons
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin()
  )
  with check (
    user_id = auth.uid()
    or public.current_user_is_admin()
  );

drop policy if exists "membership_coupons_insert_admin" on public.membership_coupons;
create policy "membership_coupons_insert_admin"
  on public.membership_coupons
  for insert
  to authenticated
  with check (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- E. link_tokens / cart_snapshots (본인만 + 관리자 조회)
-- -----------------------------------------------------------------------------
alter table if exists public.link_tokens enable row level security;
drop policy if exists "link_tokens_all_own" on public.link_tokens;
create policy "link_tokens_all_own"
  on public.link_tokens
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

alter table if exists public.cart_snapshots enable row level security;
drop policy if exists "cart_snapshots_insert_own" on public.cart_snapshots;
create policy "cart_snapshots_insert_own"
  on public.cart_snapshots
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "cart_snapshots_update_own" on public.cart_snapshots;
create policy "cart_snapshots_update_own"
  on public.cart_snapshots
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "cart_snapshots_delete_own" on public.cart_snapshots;
create policy "cart_snapshots_delete_own"
  on public.cart_snapshots
  for delete
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "cart_snapshots_select_admin" on public.cart_snapshots;
create policy "cart_snapshots_select_admin"
  on public.cart_snapshots
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin_or_manager()
  );

-- -----------------------------------------------------------------------------
-- F. 운영 체크 (중요)
-- -----------------------------------------------------------------------------
-- SQL Editor의 role=postgres 결과만으로는 RLS 누수 검증이 정확하지 않을 수 있음.
-- 반드시 앱 로그인 상태(일반 유저/관리자)에서 아래를 확인:
-- 1) 일반 유저 A: 본인 주문/쿠폰만 조회 가능해야 함
-- 2) 일반 유저 B: A 데이터가 보이면 정책 실패
-- 3) 관리자: 전체 조회 가능, 일반 유저는 전체 조회 불가
--
-- 현재 적용 정책 확인(참고용)
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'orders', 'membership_coupons', 'link_tokens', 'cart_snapshots')
order by tablename, policyname;
-- =============================================================================

