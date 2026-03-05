-- orders 테이블에 배송 스냅샷·품목·테스트 구분 컬럼 추가
-- Supabase 대시보드 → SQL Editor에서 실행 (한 번만 하면 됨)

alter table public.orders
  add column if not exists items jsonb,
  add column if not exists shipping_address text,
  add column if not exists receiver_name text,
  add column if not exists receiver_phone text,
  add column if not exists is_test boolean default false,
  add column if not exists inn text,
  add column if not exists passport_series text,
  add column if not exists passport_number text;

comment on column public.orders.items is '주문 품목 스냅샷 [{ id, name, quantity, price }]';
comment on column public.orders.is_test is 'true면 테스트/가짜 주문. 나중에 DELETE FROM orders WHERE is_test = true 로 일괄 삭제 가능';
comment on column public.orders.inn is '주문 시점 고객 INN (12자리)';
comment on column public.orders.passport_series is '주문 시점 여권 시리즈 (4자리)';
comment on column public.orders.passport_number is '주문 시점 여권 번호 (6자리)';
