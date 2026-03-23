# Telegram: превью заказов (последние 3)

Вместо отдельного экрана «статус заказов сайта» бот может сразу показывать **последние 3 заказа**, адрес, статус, трекинг и ссылку **«ещё заказы»** на сайт.

## 1. Supabase

1. Выполнить `docs/SUPABASE_ORDER_FULFILLMENT_TRACKING.sql` (колонка `fulfillment_tracking`).
2. Выполнить `docs/SUPABASE_RPC_TELEGRAM_ORDERS_PREVIEW.sql` (функция `telegram_orders_preview`).

## 2. Вызов из бота (service_role)

```ts
const { data, error } = await supabase.rpc('telegram_orders_preview', {
  p_telegram_id: String(message.from.id),
});
// data: { ok, user_id?, total_count, orders: [...] } | { ok: false, error }
```

Текст для `sendMessage` можно собрать на стороне бота так же, как в **`src/lib/telegramOrdersFormat.ts`** (`formatTelegramOrdersPreviewMessage`), либо вызывать Edge Function (ниже).

## 3. Edge Function `telegram-orders-preview` (опционально)

Удобно, если бот на Python и не использует Supabase-клиент.

```bash
supabase functions deploy telegram-orders-preview
```

**Secrets:** `TELEGRAM_ORDERS_PREVIEW_SECRET` (общий секрет с ботом), `PUBLIC_SITE_URL` (например `https://ваш-домен.ru`).

**Запрос:**

```http
POST /functions/v1/telegram-orders-preview
Content-Type: application/json
x-telegram-bot-secret: <TELEGRAM_ORDERS_PREVIEW_SECRET>

{"telegram_id": "123456789"}
```

**Ответ:** JSON из RPC плюс поля `message_ru` (готовый текст) и `orders_page_url`.

## 4. Структура трекинга (СДЭК / Почта)

См. `docs/ORDER_FULFILLMENT_TRACKING.md` и колонку `orders.fulfillment_tracking`. После синхронизации с API перевозчика те же данные отображаются в ЛК (`ProfileOrders`) и в тексте для Telegram.
