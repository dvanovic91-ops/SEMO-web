# Доставка: `orders.fulfillment_tracking` (JSONB)

Один столбец для **веба**, **Telegram** и будущей синхронизации с **СДЭК / Почта России** (или другими API).

## Схема (рекомендуемая)

```json
{
  "carrier": "cdek",
  "tracking_number": "10123456789",
  "tracking_url": "https://www.cdek.ru/tracking?order_id=...",
  "events": [
    {
      "at": "2025-03-20T14:00:00.000Z",
      "code": "in_transit",
      "label_ru": "В пути",
      "location": "Москва, сортировочный центр"
    }
  ],
  "last_synced_at": "2025-03-20T15:00:00.000Z",
  "meta": {
    "source": "cdek_api_v2",
    "raw_carrier_status": "IN_TRANSIT"
  }
}
```

| Поле | Назначение |
|------|------------|
| `carrier` | Код перевозчика: `cdek`, `pochta_ru`, `boxberry`, `other` — для выбора адаптера API. |
| `tracking_number` | Номер отслеживания на стороне перевозчика. |
| `tracking_url` | Прямая ссылка на трекинг (если API не даёт событий или как запасной вариант). |
| `events` | Последние события (новые сверху или снизу — в коде `src/lib/fulfillmentTracking.ts` задаётся порядок отображения). |
| `last_synced_at` | Когда последний раз подтягивали статус из API (для cron/Edge). |

## Связь с `orders.tracking_url`

- Уже существующая колонка `tracking_url` **не удаляется**: при отображении берётся  
  `fulfillment_tracking.tracking_url ?? orders.tracking_url`.
- При записи из админки можно дублировать ссылку в оба места или заполнять только JSON.

## Код

- Типы и разбор: `src/lib/fulfillmentTracking.ts`
- Русские статусы заказа (оплата / сборка / доставка): `src/lib/orderStatusRu.ts`
- Текст для Telegram (превью заказов): `src/lib/telegramOrdersFormat.ts`
