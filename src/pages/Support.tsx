import React, { useMemo, useState } from 'react';

type FaqItem = { q: string; a: string };
type FaqCategory = { key: string; title: string; summary: string; items: FaqItem[] };

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: 'shipping',
    title: 'Доставка',
    summary: 'Сроки, трек-номер, повторная доставка.',
    items: [
      { q: 'Сколько занимает доставка в Россию?', a: 'Обычно 7–20 дней после подтверждения оплаты. В периоды высокой нагрузки срок может увеличиться.' },
      { q: 'Когда я получу трек-номер?', a: 'Трек отправляется после передачи посылки в международную логистику. Обычно в течение 1–3 рабочих дней.' },
      { q: 'Что делать, если доставка задерживается?', a: 'Проверьте статус по трек-номеру. Если статус не меняется более 7 дней, напишите нам в Telegram поддержки.' },
      { q: 'Можно ли изменить адрес после оплаты?', a: 'Да, пока заказ не передан в международную доставку. После отправки изменить адрес нельзя.' },
    ],
  },
  {
    key: 'customs',
    title: 'Таможня и пошлины',
    summary: 'Лимиты, документы, возможные сборы.',
    items: [
      { q: 'Нужно ли платить таможенную пошлину?', a: 'Зависит от текущих лимитов и стоимости заказа. При превышении лимита пошлину оплачивает получатель.' },
      { q: 'Кто связывается по таможенным вопросам?', a: 'Обычно курьерская/логистическая служба напрямую запрашивает данные и подтверждение.' },
      { q: 'Какие данные могут запросить?', a: 'ФИО, адрес, ИНН, паспортные данные — только если это требуется для таможенного оформления.' },
    ],
  },
  {
    key: 'returns',
    title: 'Возврат и обмен',
    summary: 'Повреждение, ошибка комплектации, сроки заявки.',
    items: [
      { q: 'Можно ли вернуть заказ надлежащего качества?', a: 'Косметическая продукция возврату после вскрытия не подлежит. Невскрытые позиции рассматриваются индивидуально.' },
      { q: 'Что делать, если товар повреждён?', a: 'Сделайте фото/видео в день получения и отправьте в поддержку. Мы предложим замену или компенсацию.' },
      { q: 'Что если пришёл не тот товар?', a: 'Сообщите в поддержку с фото этикетки и содержимого. Ошибку комплектации исправим приоритетно.' },
      { q: 'Сколько есть времени на обращение?', a: 'Рекомендуем обратиться в течение 48 часов после получения заказа.' },
    ],
  },
  {
    key: 'payment',
    title: 'Оплата и скидки',
    summary: 'Оплата, купоны, списание баллов.',
    items: [
      { q: 'Когда списываются баллы и купоны?', a: 'Баллы и купоны применяются на этапе оформления заказа, до финального подтверждения оплаты.' },
      { q: 'Можно ли одновременно использовать баллы и купон?', a: 'Да, если это разрешено текущими правилами корзины и лимитами по заказу.' },
      { q: 'Почему купон не применяется?', a: 'Проверьте срок действия, статус использования и минимальные условия заказа.' },
    ],
  },
  {
    key: 'account',
    title: 'Аккаунт и безопасность',
    summary: 'Telegram, email, профиль и уведомления.',
    items: [
      { q: 'Зачем подтверждать email?', a: 'Подтверждённый email нужен для статусов заказа, чеков и сервисных уведомлений.' },
      { q: 'Что даёт привязка Telegram?', a: 'Быстрые уведомления о заказе и акциях, а также более удобная связь с поддержкой.' },
      { q: 'Как изменить личные данные доставки?', a: 'Откройте Профиль → Личные данные и обновите информацию перед новым заказом.' },
    ],
  },
];

export const Support: React.FC = () => {
  const [openKey, setOpenKey] = useState<string>('');
  const [query, setQuery] = useState('');
  const categoryCountLabel = useMemo(() => `${FAQ_CATEGORIES.length} разделов`, []);
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES
      .map((cat) => {
        const catHit = `${cat.title} ${cat.summary}`.toLowerCase().includes(q);
        const items = cat.items.filter((it) => `${it.q} ${it.a}`.toLowerCase().includes(q));
        if (catHit) return cat;
        return { ...cat, items };
      })
      .filter((cat) => cat.items.length > 0);
  }, [query]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">FAQ</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">
          Частые вопросы по международной доставке, таможне, возвратам и аккаунту.
        </p>
        <p className="mt-1 text-xs text-slate-500">{categoryCountLabel}</p>
      </header>

      <div className="mb-5">
        <label htmlFor="faq-search" className="sr-only">
          Поиск по FAQ
        </label>
        <input
          id="faq-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск: доставка, пошлина, возврат, купон..."
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <section className="space-y-4">
        {filteredCategories.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            По запросу ничего не найдено. Попробуйте другое ключевое слово.
          </div>
        )}
        {filteredCategories.map((cat) => (
          <article key={cat.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900 sm:text-base">{cat.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{cat.summary}</p>
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
                      <span className="text-sm font-medium text-slate-800">{item.q}</span>
                      <span className="shrink-0 text-slate-400">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <p className="pb-4 text-sm leading-relaxed text-slate-600">{item.a}</p>}
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
