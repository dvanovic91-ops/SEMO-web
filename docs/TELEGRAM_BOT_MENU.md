# Telegram user-бот — меню и связь с сайтом / Supabase

**Код пользовательского бота:** `semo_bot/클라우드 작업파일/최종 코드/user_bot.py`  
**Supabase-хелпер (таблицы, RPC):** `semo_bot/클라우드 작업파일/최종 코드/supabase_helper.py`

Окружение бота: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SITE_URL` (или `TELEGRAM_WEB_APP_URL` / `BOT_PUBLIC_SITE_URL`) — для ссылок на сайт и корзину `/?add_item=`.

---

## Нижнее меню (ReplyKeyboard) — строки должны **точно совпадать** с `handle_text`

| Переменная в коде | Текст кнопки |
|-------------------|----------------|
| `KB_TEST` | `🧴 Тест кожи` |
| `KB_SHOP` | `🛒 Магазин` |
| `KB_PROFILE` | `✨ Личный кабинет` |
| `KB_HELP` | `❓ Помощь` |

Маршрут веб: `/skin-test`, `/shop`, `/profile`, `/support` (и подстраницы профиля ниже).

---

## Личный кабинет (inline) — подменю

| Кнопка в боте | callback | Данные Supabase / страница сайта |
|---------------|----------|-----------------------------------|
| Мои данные | `CABINET_PROFILE` | `profiles` + `shipping_addresses` |
| Мои тесты | `MY_RESULT` | `skin_test_results` (последний тип + `baumann_scores`), ссылка **«Все тесты на сайте»** → `/profile/test-results` |
| Мои заказы | `ORDER_CHECK` | `orders` |
| Баллы | `CABINET_POINTS` | `profiles.points` |
| Купоны | `CABINET_COUPONS` | `membership_coupons` |
| Уведомления | `TG_PREFS_CAB` | `profiles.telegram_notify_orders`, `telegram_notify_marketing` |

Документ «гид по уходу» в ЛК **не используется** (см. историю требований).

---

## Магазин (inline)

| Кнопка | callback | Сайт |
|--------|----------|------|
| Каталог | `SHOP` | `main_layout_slots` + `products`, как витрина |
| Акции и баннеры | `PROMO` | таблица `promos` → страница `/promo` |

---

## Помощь

- FAQ: ключи разделов как на сайте `src/pages/Support.tsx` (`shipping`, `customs`, `returns`, `payment`, `account`) — тексты в боте упрощённые RU, структура совпадает.
- Поддержка: `CONTACT` / `SUPPORT_EMAIL` из env.

---

## Результат теста после прохождения на сайте

- Веб сохраняет в `skin_test_results`: `skin_type`, `baumann_scores`, `concern_text`, `selfie_analysis`, …  
- Бот при **«Мои тесты»** читает последнюю строку и **парсит `baumann_scores`**, чтобы строка «Баллы: Увл. …» совпадала с сайтом (не нули).

## RPC / Edge

- `link_telegram` — привязка аккаунта (`/start link_<uuid>`), см. веб и `supabase_helper.link_telegram`.
- `get_recommended_product_id_for_skin_type` — тот же товар, что рекомендует веб (fallback на таблицы в `supabase_helper`).

---

## Маршруты сайта (проверка ссылок из бота)

- `/product/:id`, `/?add_item={id}`, `/recommendations/:skinType`, `/profile/edit`, `/profile/test-results`, `/shop`, `/promo` — заданы в `user_bot.py` через `web_base_url()`.
