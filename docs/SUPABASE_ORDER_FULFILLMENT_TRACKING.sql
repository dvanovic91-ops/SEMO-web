-- orders: структурированное отслеживание (СДЭК / Почта России и т.д.)
-- Веб и Telegram читают один и тот же JSON; позже Edge/cron может подтягивать статусы по API перевозчика.

alter table public.orders
  add column if not exists fulfillment_tracking jsonb;

comment on column public.orders.fulfillment_tracking is
  'Доставка: см. docs/ORDER_FULFILLMENT_TRACKING.md. carrier, tracking_number, tracking_url, events[], last_synced_at. Колонка tracking_url остаётся для обратной совместимости и как fallback.';
