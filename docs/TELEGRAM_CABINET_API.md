# Личный кабинет в Telegram (как на сайте)

После привязки `profiles.telegram_id` бот может показать **те же сущности**, что и веб-ЛК:

- баланс **баллов** (`profiles.points`);
- список **купонов** (`membership_coupons` — как страница «Мои купоны»);
- **доставка**: ФИО, адрес, телефон из `shipping_addresses` (как в профиле).

## 1. SQL

Выполнить **`docs/SUPABASE_RPC_TELEGRAM_CABINET.sql`** в Supabase SQL Editor.

## 2. RPC (из бота, `service_role`)

```ts
const { data, error } = await supabase.rpc('telegram_cabinet_preview', {
  p_telegram_id: String(message.from.id),
});
```

Ответ `data`:

| Поле | Смысл |
|------|--------|
| `ok` | `true` / при ошибке `false` + `error` |
| `error` | `telegram_not_linked`, `missing_telegram_id` |
| `display_name` | имя из профиля |
| `points` | число |
| `coupons` | массив до 25 строк: `id`, `amount`, `expires_at`, `used_at`, `tier`, `quarter_label` |
| `shipping` | `null` или `{ fio, address_line, phone }` |

## 3. Edge Function (HTTP для бота без Supabase-клиента)

```bash
supabase functions deploy telegram-cabinet-preview
```

**Secrets:** `TELEGRAM_USER_BOT_TOKEN` не нужен (только чтение БД), нужны `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_CABINET_PREVIEW_SECRET`, `PUBLIC_SITE_URL`.

```http
POST /functions/v1/telegram-cabinet-preview
Content-Type: application/json
x-telegram-bot-secret: <TELEGRAM_CABINET_PREVIEW_SECRET>

{"telegram_id": "123456789"}
```

В ответе: поля RPC + **`message_ru`** — готовый текст для `sendMessage`.

## 4. История баллов (ledger)

Сейчас в RPC только **баланс**. Полная история как на `/profile/points` потребует отдельного RPC по `points_ledger` — при необходимости добавим позже.
