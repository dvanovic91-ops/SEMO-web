-- cart_snapshots에 "장바구니에 담은 시간"용 created_at 컬럼 추가
-- Supabase SQL Editor에서 실행

alter table public.cart_snapshots
  add column if not exists created_at timestamptz default now();

comment on column public.cart_snapshots.created_at is '최초 장바구니 담은 시각. Admin 장바구니 이탈 명단 "장바구니에 담은 시간" 표시용';

-- 기존 행: created_at 없었으므로 updated_at으로 채움
update public.cart_snapshots
  set created_at = updated_at
  where created_at is null;
