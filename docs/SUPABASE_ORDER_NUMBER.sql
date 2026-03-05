-- orders 테이블에 고객 노출용 주문번호 컬럼 추가 (알파벳 1자 + 숫자 6자, 예: A123456)
-- 기존 주문은 null 유지 → 화면에서는 id 앞 8자로 폴백

alter table public.orders
  add column if not exists order_number text;

create unique index if not exists orders_order_number_key
  on public.orders (order_number)
  where order_number is not null;

comment on column public.orders.order_number is '고객 노출용 주문번호. 형식: 알파벳 1자 + 숫자 6자 (예: A123456)';
