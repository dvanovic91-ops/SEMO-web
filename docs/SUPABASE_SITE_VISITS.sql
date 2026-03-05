-- 사이트 트래픽 집계용: 로그인·비로그인 방문 기록 (일/주/월 트래픽·그래프용)
-- Supabase SQL Editor에서 실행

create table if not exists public.site_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  session_id text,
  created_at timestamptz default now()
);

comment on table public.site_visits is '페이지 방문 기록. 로그인 시 user_id, 비로그인 시 session_id(브라우저 저장)로 일/주/월 유니크 방문자 집계';
comment on column public.site_visits.session_id is '비로그인 방문자 구분용. 클라이언트 localStorage 등으로 생성·유지';

-- 인덱스: 일별/주별/월별 집계 시 created_at 범위 조회
create index if not exists site_visits_created_at_idx on public.site_visits (created_at);

alter table public.site_visits enable row level security;

-- 로그인 사용자: 본인 user_id로만 insert
drop policy if exists "site_visits_insert_authenticated" on public.site_visits;
create policy "site_visits_insert_authenticated"
  on public.site_visits for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 비로그인(anon): user_id null, session_id 있으면 insert 허용
drop policy if exists "site_visits_insert_anon" on public.site_visits;
create policy "site_visits_insert_anon"
  on public.site_visits for insert
  to anon
  with check (user_id is null and session_id is not null and session_id <> '');

-- 조회: 관리자만 (대시보드 트래픽용)
drop policy if exists "site_visits_select_admin" on public.site_visits;
create policy "site_visits_select_admin"
  on public.site_visits for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
