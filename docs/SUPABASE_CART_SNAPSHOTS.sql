-- 장바구니 이탈(미결제) 명단: 로그인 사용자가 장바구니에 담고 나간 경우 저장 → CRM/리타겟팅용
-- Supabase SQL Editor에서 실행

create table if not exists public.cart_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]',
  total_cents integer not null default 0,
  updated_at timestamptz default now()
);

comment on table public.cart_snapshots is '로그인 사용자 장바구니 스냅샷. 장바구니 페이지 방문 시 upsert, 주문 완료 시 삭제 → 남은 행 = 이탈 명단';
comment on column public.cart_snapshots.items is '[{ id, name, quantity, price }]';
comment on column public.cart_snapshots.updated_at is '마지막 장바구니 갱신 시각';

alter table public.cart_snapshots enable row level security;

-- 본인만 insert/update (upsert용)
drop policy if exists "cart_snapshots_insert_own" on public.cart_snapshots;
create policy "cart_snapshots_insert_own"
  on public.cart_snapshots for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "cart_snapshots_update_own" on public.cart_snapshots;
create policy "cart_snapshots_update_own"
  on public.cart_snapshots for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 본인만 delete (주문 완료 시 클라이언트에서 삭제)
drop policy if exists "cart_snapshots_delete_own" on public.cart_snapshots;
create policy "cart_snapshots_delete_own"
  on public.cart_snapshots for delete
  to authenticated
  using (auth.uid() = user_id);

-- 관리자: 전체 조회 (명단/CRM용)
drop policy if exists "cart_snapshots_select_admin" on public.cart_snapshots;
create policy "cart_snapshots_select_admin"
  on public.cart_snapshots for select
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
