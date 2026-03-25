-- =============================================================================
-- 관리자/매니저: profiles RLS (무한 재귀 방지) + 역할 컬럼 + 초기 권한
-- Supabase 대시보드 → SQL Editor에서 이 파일 전체 실행.
-- =============================================================================
-- 문제: 정책 안에서 "exists (select from profiles)" 를 쓰면 profiles 조회 시
--       같은 정책이 다시 실행되며 "infinite recursion" 500 에러 발생.
-- 해결: SECURITY DEFINER 함수로 권한만 조회(RLS 우회) 후 정책에서 함수만 호출.
-- =============================================================================

-- 역할 컬럼 (없으면 추가)
alter table public.profiles add column if not exists is_manager boolean default false;

-- ---------- 1) 권한 검사용 함수 (RLS 무한 재귀 방지) ----------
-- 정책에서 profiles를 직접 읽지 않고 이 함수만 호출. 함수는 definer 권한으로 profiles 1행만 읽음.
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

-- ---------- 2) profiles 정책 (함수 사용으로 재귀 제거) ----------
drop policy if exists "관리자는 전체 프로필 조회" on public.profiles;
create policy "관리자는 전체 프로필 조회"
  on public.profiles for select
  using (
    auth.uid() = id
    or public.current_user_is_admin_or_manager()
  );

drop policy if exists "관리자는 전체 프로필 수정(권한부여)" on public.profiles;
create policy "관리자는 전체 프로필 수정(권한부여)"
  on public.profiles for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

-- ---------- 3) 개발자/운영 관리자 권한 부여 ----------
update public.profiles
set is_admin = true, is_manager = false, updated_at = now()
where lower(trim(email)) = 'dvanovic91@gmail.com';

update public.profiles
set is_admin = true, is_manager = false, updated_at = now()
where lower(trim(email)) = 'admin@semo-box.ru';

-- ---------- 4) orders / site_visits (함수 사용으로 재귀 제거) ----------
drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
  on public.orders for select to authenticated
  using (public.current_user_is_admin_or_manager());

drop policy if exists "site_visits_select_admin" on public.site_visits;
create policy "site_visits_select_admin"
  on public.site_visits for select to authenticated
  using (public.current_user_is_admin_or_manager());
