-- =============================================================================
-- Beauty Box — profiles / shipping_addresses RLS 재적용·감사용
-- Supabase SQL Editor에서 실행: 본인(auth.uid()) 행만 SELECT/INSERT/UPDATE/DELETE 가능
-- (관리자용 별도 정책이 있으면 docs/SUPABASE_PROFILES_ADMIN_RLS.sql 와 충돌 여부 확인)
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.shipping_addresses enable row level security;

drop policy if exists "본인만 조회/수정" on public.profiles;
create policy "본인만 조회/수정"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "본인 배송지만 조회/수정" on public.shipping_addresses;
create policy "본인 배송지만 조회/수정"
  on public.shipping_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
