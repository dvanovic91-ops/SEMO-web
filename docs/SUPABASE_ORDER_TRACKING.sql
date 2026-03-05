-- orders 테이블에 배송 추적 URL 컬럼 추가 (СДЭК, Почта России 등 링크 저장)
-- 관리자에서 발송 시 URL 입력 → 고객 주문내역에서 "Отслеживание доставки" 링크로 표시

alter table public.orders
  add column if not exists tracking_url text;

comment on column public.orders.tracking_url is '배송 추적 URL (SDEK/우체국 등). 발송중·도착 시 고객에게 노출';
