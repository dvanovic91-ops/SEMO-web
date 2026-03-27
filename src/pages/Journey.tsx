import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';

/**
 * Journey to SEMO — тест кожи → подбор → заказ с данными для таможни РФ → доставка из Кореи до двери.
 * 4 шага, чередование изображение/текст.
 */
type JourneyStep = {
  title: { en: string; ru: string };
  subtitle: { en: string; ru: string };
  description: { en: string; ru: string };
  bullets?: { en: string[]; ru: string[] };
  imagePlaceholder: string;
  imageUrl?: string;
};

const STEPS: JourneyStep[] = [
  {
    title: { en: 'Test & Match', ru: 'Test & Match' },
    subtitle: { en: 'Skin type test and product matching', ru: 'Тест типа кожи и подбор средств' },
    description: {
      en: 'Take the test on our site — we identify your skin type and show suitable Korean products. After the result, you get personalized recommendations in the catalog.',
      ru: 'Пройдите тест на сайте — мы определим тип кожи и покажем подходящие корейские продукты. После результата откроются персональные рекомендации в каталоге: так вы выбираете уход осознанно, до оплаты.',
    },
    imagePlaceholder: '1',
  },
  {
    title: { en: 'Order & Customs', ru: 'Order & Customs' },
    subtitle: { en: 'Checkout and customs details', ru: 'Оформление заказа и данные для таможни' },
    description: {
      en: 'International delivery and customs clearance require complete recipient details. You enter everything in your profile during checkout to avoid delays.',
      ru: 'Международная доставка и таможенная очистка требуют полных и точных данных получателя. Всё это вы указываете при заказе в профиле — один раз аккуратно, чтобы посылка прошла без задержек.',
    },
    bullets: {
      en: [
        'Full name in Latin letters, address, postal code',
        'INN and passport details for customs',
        'Phone verified in Telegram and e-mail',
      ],
      ru: [
        'ФИО латиницей (как в паспорте), адрес, индекс',
        'ИНН и паспорт — для таможни',
        'Телефон с подтверждением в Telegram и e-mail',
      ],
    },
    imagePlaceholder: '2',
  },
  {
    title: { en: 'From Korea', ru: 'From Korea' },
    subtitle: { en: 'Shipped from Korea', ru: 'Отправка из Кореи' },
    description: {
      en: 'After payment, your order is packed and shipped from Korea. Then it goes to your destination via reliable shipping partners.',
      ru: 'После оплаты заказ собирается и отправляется из Кореи. Дальше посылка идёт к вашему адресату: мы используем надёжные службы доставки (например, СДЭК или местные службы — в зависимости от маршрута и доступности).',
    },
    imagePlaceholder: '3',
  },
  {
    title: { en: 'To Your Door', ru: 'To Your Door' },
    subtitle: { en: 'Delivered to your address', ru: 'До вашей двери' },
    description: {
      en: 'After arrival, your parcel is delivered by courier or to a pickup point. Tracking and order status are always available in your account.',
      ru: 'По прибытии в страну посылка передаётся курьеру или к выбранному пункту выдачи — к двери квартиры, до постамата или отделения — удобно для вас. Трекинг и статус заказа доступны в личном кабинете.',
    },
    imagePlaceholder: '4',
  },
];

export const Journey: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
          Journey to SEMO
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          {isEn
            ? 'From skin testing and product matching to customs-ready checkout and delivery from Korea to your address — in four steps.'
            : 'От теста типа кожи и подбора корейской косметики до заказа с данными для таможни и доставки из Кореи до вашего адреса — в четыре шага.'}
        </p>
      </header>

      <section className="space-y-24 md:space-y-32">
        {STEPS.map((step, index) => {
          const isImageLeft = index % 2 === 0;
          const stepNum = index + 1;
          return (
            <article
              key={step.subtitle.ru}
              className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12 lg:gap-16"
            >
              <div
                className={`relative min-h-[280px] overflow-hidden rounded-2xl bg-slate-100 sm:min-h-[360px] md:min-h-[420px] lg:min-h-[460px] ${
                  isImageLeft ? '' : 'md:order-2'
                }`}
              >
                {step.imageUrl ? (
                  <img
                    src={step.imageUrl}
                    alt={isEn ? step.subtitle.en : step.subtitle.ru}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-soft/30 to-slate-100">
                    <span className="text-4xl font-semibold text-slate-300 sm:text-5xl md:text-6xl">
                      {step.imagePlaceholder}
                    </span>
                  </div>
                )}
              </div>

              <div className={`flex flex-col justify-center ${isImageLeft ? '' : 'md:order-1'}`}>
                <span className="text-sm font-semibold tracking-wide text-brand">Step {stepNum}</span>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {isEn ? step.title.en : step.title.ru}
                </h2>
                <p className="mt-1 text-lg font-medium text-slate-700">{isEn ? step.subtitle.en : step.subtitle.ru}</p>
                <p className="prose-ru mt-4 text-base leading-relaxed text-slate-600">{isEn ? step.description.en : step.description.ru}</p>
                {step.bullets && (isEn ? step.bullets.en : step.bullets.ru).length > 0 && (
                  <ul className="mt-5 space-y-2.5 text-left">
                    {(isEn ? step.bullets.en : step.bullets.ru).map((line) => (
                      <li key={line} className="flex gap-2.5 text-sm leading-snug text-slate-600 sm:text-base">
                        <span
                          className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                          aria-hidden
                        />
                        <span className="prose-ru min-w-0">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <div className="mt-20 flex flex-col items-center justify-center gap-3 pb-12 sm:flex-row sm:gap-4">
        <Link
          to="/skin-test"
          className="w-full rounded-full bg-brand px-8 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand/90 sm:w-auto"
        >
          {isEn ? 'Take skin test' : 'Пройти тест кожи'}
        </Link>
        <Link
          to="/shop"
          className="w-full rounded-full border border-slate-200 bg-white px-8 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand sm:w-auto"
        >
          {isEn ? 'Go to catalog' : 'В каталог'}
        </Link>
      </div>
    </main>
  );
};
