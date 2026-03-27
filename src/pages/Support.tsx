import React, { useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';

type FaqItem = { q: { ru: string; en: string }; a: { ru: string; en: string } };
type FaqCategory = { key: string; title: { ru: string; en: string }; summary: { ru: string; en: string }; items: FaqItem[] };

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: 'shipping',
    title: { ru: 'Доставка', en: 'Shipping' },
    summary: { ru: 'Сроки, трек-номер, повторная доставка.', en: 'Delivery time, tracking, redelivery.' },
    items: [
      {
        q: { ru: 'Сколько занимает доставка до вашей страны?', en: 'How long does shipping take to your country?' },
        a: {
          ru: 'Обычно 7–20 дней после подтверждения оплаты. В периоды высокой нагрузки срок может увеличиться.',
          en: 'Usually 7-20 days after payment confirmation. In peak periods it may take longer.',
        },
      },
      { q: { ru: 'Когда я получу трек-номер?', en: 'When do I receive a tracking number?' }, a: { ru: 'Трек отправляется после передачи посылки в международную логистику. Обычно в течение 1–3 рабочих дней.', en: 'Tracking is sent after parcel handover to international logistics, usually within 1-3 business days.' } },
      { q: { ru: 'Что делать, если доставка задерживается?', en: 'What if delivery is delayed?' }, a: { ru: 'Проверьте статус по трек-номеру. Если статус не меняется более 7 дней, напишите нам в Telegram поддержки.', en: 'Check the tracking status. If it does not change for more than 7 days, contact support in Telegram.' } },
      { q: { ru: 'Можно ли изменить адрес после оплаты?', en: 'Can I change address after payment?' }, a: { ru: 'Да, пока заказ не передан в международную доставку. После отправки изменить адрес нельзя.', en: 'Yes, before international shipment handover. After dispatch, address change is not possible.' } },
    ],
  },
  {
    key: 'customs',
    title: { ru: 'Таможня и пошлины', en: 'Customs & Duties' },
    summary: { ru: 'Лимиты, документы, возможные сборы.', en: 'Limits, documents, possible fees.' },
    items: [
      { q: { ru: 'Нужно ли платить таможенную пошлину?', en: 'Do I need to pay customs duty?' }, a: { ru: 'Зависит от текущих лимитов и стоимости заказа. При превышении лимита пошлину оплачивает получатель.', en: 'It depends on current limits and order value. If limits are exceeded, duty is paid by the recipient.' } },
      { q: { ru: 'Кто связывается по таможенным вопросам?', en: 'Who contacts me for customs issues?' }, a: { ru: 'Обычно курьерская/логистическая служба напрямую запрашивает данные и подтверждение.', en: 'Usually the courier/logistics partner contacts you directly for required confirmation.' } },
      { q: { ru: 'Какие данные могут запросить?', en: 'What data can be requested?' }, a: { ru: 'ФИО, адрес, ИНН, паспортные данные — только если это требуется для таможенного оформления.', en: 'Full name, address, INN, passport details - only when required for customs clearance.' } },
    ],
  },
  {
    key: 'returns',
    title: { ru: 'Возврат и обмен', en: 'Returns & Exchange' },
    summary: { ru: 'Повреждение, ошибка комплектации, сроки заявки.', en: 'Damage, wrong item, request period.' },
    items: [
      { q: { ru: 'Можно ли вернуть заказ надлежащего качества?', en: 'Can I return a normal-quality order?' }, a: { ru: 'Косметическая продукция возврату после вскрытия не подлежит. Невскрытые позиции рассматриваются индивидуально.', en: 'Opened cosmetic products are non-returnable. Unopened items are reviewed case by case.' } },
      { q: { ru: 'Что делать, если товар повреждён?', en: 'What if the item is damaged?' }, a: { ru: 'Сделайте фото/видео в день получения и отправьте в поддержку. Мы предложим замену или компенсацию.', en: 'Take photos/videos on delivery day and send to support. We will offer replacement or compensation.' } },
      { q: { ru: 'Что если пришёл не тот товар?', en: 'What if I received the wrong item?' }, a: { ru: 'Сообщите в поддержку с фото этикетки и содержимого. Ошибку комплектации исправим приоритетно.', en: 'Contact support with label and content photos. Packing mistakes are fixed with priority.' } },
      { q: { ru: 'Сколько есть времени на обращение?', en: 'How long do I have to report an issue?' }, a: { ru: 'Рекомендуем обратиться в течение 48 часов после получения заказа.', en: 'We recommend contacting us within 48 hours after delivery.' } },
    ],
  },
  {
    key: 'payment',
    title: { ru: 'Оплата и скидки', en: 'Payment & Discounts' },
    summary: { ru: 'Оплата, купоны, списание баллов.', en: 'Payment, coupons, points usage.' },
    items: [
      { q: { ru: 'Когда списываются баллы и купоны?', en: 'When are points and coupons applied?' }, a: { ru: 'Баллы и купоны применяются на этапе оформления заказа, до финального подтверждения оплаты.', en: 'Points and coupons are applied during checkout before final payment confirmation.' } },
      { q: { ru: 'Можно ли одновременно использовать баллы и купон?', en: 'Can I use points and coupon together?' }, a: { ru: 'Да, если это разрешено текущими правилами корзины и лимитами по заказу.', en: 'Yes, if allowed by current cart rules and order limits.' } },
      { q: { ru: 'Почему купон не применяется?', en: 'Why is my coupon not applied?' }, a: { ru: 'Проверьте срок действия, статус использования и минимальные условия заказа.', en: 'Check expiry date, usage status, and minimum order conditions.' } },
    ],
  },
  {
    key: 'account',
    title: { ru: 'Аккаунт и безопасность', en: 'Account & Security' },
    summary: { ru: 'Telegram, email, профиль и уведомления.', en: 'Telegram, email, profile, notifications.' },
    items: [
      { q: { ru: 'Зачем подтверждать email?', en: 'Why should I verify my email?' }, a: { ru: 'Подтверждённый email нужен для статусов заказа, чеков и сервисных уведомлений.', en: 'Verified email is required for order status updates, receipts, and service notifications.' } },
      { q: { ru: 'Что даёт привязка Telegram?', en: 'What is Telegram linking for?' }, a: { ru: 'Быстрые уведомления о заказе и акциях, а также более удобная связь с поддержкой.', en: 'Faster order and promo notifications, plus easier support contact.' } },
      { q: { ru: 'Как изменить личные данные доставки?', en: 'How can I update delivery details?' }, a: { ru: 'Откройте Профиль → Личные данные и обновите информацию перед новым заказом.', en: 'Open Profile -> Personal details and update information before the next order.' } },
    ],
  },
];

export const Support: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const [openKey, setOpenKey] = useState<string>('');
  const [query, setQuery] = useState('');
  const categoryCountLabel = useMemo(
    () => (isEn ? `${FAQ_CATEGORIES.length} sections` : `${FAQ_CATEGORIES.length} разделов`),
    [isEn],
  );
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES
      .map((cat) => {
        const catText = `${isEn ? cat.title.en : cat.title.ru} ${isEn ? cat.summary.en : cat.summary.ru}`;
        const catHit = catText.toLowerCase().includes(q);
        const items = cat.items.filter((it) => `${isEn ? it.q.en : it.q.ru} ${isEn ? it.a.en : it.a.ru}`.toLowerCase().includes(q));
        if (catHit) return cat;
        return { ...cat, items };
      })
      .filter((cat) => cat.items.length > 0);
  }, [query, isEn]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">FAQ</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">
          {isEn
            ? 'Frequently asked questions about international shipping, customs, returns, and account.'
            : 'Частые вопросы по международной доставке, таможне, возвратам и аккаунту.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">{categoryCountLabel}</p>
      </header>

      <div className="mb-5">
        <label htmlFor="faq-search" className="sr-only">
          {isEn ? 'Search FAQ' : 'Поиск по FAQ'}
        </label>
        <input
          id="faq-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isEn ? 'Search: shipping, customs, return, coupon...' : 'Поиск: доставка, пошлина, возврат, купон...'}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <section className="space-y-4">
        {filteredCategories.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {isEn ? 'No results found. Try another keyword.' : 'По запросу ничего не найдено. Попробуйте другое ключевое слово.'}
          </div>
        )}
        {filteredCategories.map((cat) => (
          <article key={cat.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900 sm:text-base">{isEn ? cat.title.en : cat.title.ru}</h2>
              <p className="mt-1 text-xs text-slate-500">{isEn ? cat.summary.en : cat.summary.ru}</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {cat.items.map((item, idx) => {
                const key = `${cat.key}:${idx}`;
                const isOpen = openKey === key;
                return (
                  <li key={key} className="px-4 py-1 sm:px-5">
                    <button
                      type="button"
                      onClick={() => setOpenKey((prev) => (prev === key ? '' : key))}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-medium text-slate-800">{isEn ? item.q.en : item.q.ru}</span>
                      <span className="shrink-0 text-slate-400">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <p className="pb-4 text-sm leading-relaxed text-slate-600">{isEn ? item.a.en : item.a.ru}</p>}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
};
