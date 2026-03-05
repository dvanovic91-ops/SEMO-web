-- orders 테이블에 결제 시 사용한 포인트(코펙 단위) 저장
-- Admin 주문 목록에서 "사용 포인트" 컬럼 표시용

alter table public.orders
  add column if not exists points_used int default 0;

comment on column public.orders.points_used is '결제 시 사용한 포인트(코펙 단위). 0이면 미사용. Admin에서 사용 포인트 컬럼 표시용';
