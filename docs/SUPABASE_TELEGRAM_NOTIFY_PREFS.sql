-- =============================================================================
-- Beauty Box — Telegram 알림 동의 (주문/배송 vs 마케팅: 신제품·할인)
-- SQL Editor에서 한 번 실행. 기존 행: 주문 알림 기본 켜짐, 마케팅 기본 꺼짐(명시적 옵트인).
-- =============================================================================

alter table public.profiles
  add column if not exists telegram_notify_orders boolean not null default true;

alter table public.profiles
  add column if not exists telegram_notify_marketing boolean not null default false;

comment on column public.profiles.telegram_notify_orders is
  'Telegram: заказ, оплата, отправка, доставка (транзакционные уведомления)';
comment on column public.profiles.telegram_notify_marketing is
  'Telegram: новинки, скидки, акции (маркетинг; только при согласии)';

-- -----------------------------------------------------------------------------
-- Edge Function `telegram-broadcast-marketing` 배포 후 Secrets:
--   TELEGRAM_USER_BOT_TOKEN, TELEGRAM_BROADCAST_SECRET (어드민 봇 /tg_broadcast용),
--   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (JWT 검증용)
-- -----------------------------------------------------------------------------
