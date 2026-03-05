-- 관리자가 주문 목록 조회·수령인 정보 수정할 수 있도록 RLS 정책 추가
-- 기존 "본인 주문만" 정책은 그대로 두고, 관리자만 추가 권한 부여
-- Supabase SQL Editor에서 실행

drop policy if exists "orders_select_admin" on public.orders;
create policy "orders_select_admin"
  on public.orders for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "orders_update_admin" on public.orders;
create policy "orders_update_admin"
  on public.orders for update
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  )
  with check (true);
