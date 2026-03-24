import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Journey to SEMO — тест кожи → подбор → заказ с данными для таможни РФ → доставка из Кореи до двери.
 * 4 шага, чередование изображение/текст.
 */
type JourneyStep = {
  titleEn: string;
  titleRu: string;
  description: string;
  bullets?: string[];
  imagePlaceholder: string;
  imageUrl?: string;
};

const STEPS: JourneyStep[] = [
  {
    titleEn: 'Test & Match',
    titleRu: 'Тест типа кожи и подбор средств',
    description:
      'Пройдите тест на сайте — мы определим тип кожи и покажем подходящие корейские продукты. После результата откроются персональные рекомендации в каталоге: так вы выбираете уход осознанно, до оплаты.',
    imagePlaceholder: '1',
  },
  {
    titleEn: 'Order & Customs',
    titleRu: 'Оформление заказа и данные для таможни РФ',
    description:
      'Международная доставка и личная таможенная очистка в России требуют полных и точных данных получателя. Всё это вы указываете при заказе в профиле — один раз аккуратно, чтобы посылка прошла без задержек.',
    bullets: [
      'ФИО латиницей (как в паспорте), адрес, индекс',
      'ИНН и паспорт — для таможни',
      'Телефон с подтверждением в Telegram и e-mail',
    ],
    imagePlaceholder: '2',
  },
  {
    titleEn: 'From Korea',
    titleRu: 'Отправка из Кореи',
    description:
      'После оплаты заказ собирается и отправляется из Кореи. Дальше посылка идёт в Россию: мы используем надёжные службы доставки (например, СДЭК или Почта России / EMS — в зависимости от маршрута и доступности).',
    imagePlaceholder: '3',
  },
  {
    titleEn: 'To Your Door',
    titleRu: 'До вашей двери в России',
    description:
      'По прибытии в страну посылка передаётся курьеру или к выбранному пункту выдачи — к двери квартиры, до постамата или отделения — удобно для вас. Трекинг и статус заказа доступны в личном кабинете.',
    imagePlaceholder: '4',
  },
];

export const Journey: React.FC = () => {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-12 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
          Journey to SEMO
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
          От теста типа кожи и подбора корейской косметики до заказа с данными для таможни и доставки из Кореи до вашего адреса в России — в четыре шага.
        </p>
      </header>

      <section className="space-y-24 md:space-y-32">
        {STEPS.map((step, index) => {
          const isImageLeft = index % 2 === 0;
          const stepNum = index + 1;
          return (
            <article
              key={step.titleRu}
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
                    alt={step.titleRu}
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
                  {step.titleEn}
                </h2>
                <p className="mt-1 text-lg font-medium text-slate-700">{step.titleRu}</p>
                <p className="prose-ru mt-4 text-base leading-relaxed text-slate-600">{step.description}</p>
                {step.bullets && step.bullets.length > 0 && (
                  <ul className="mt-5 space-y-2.5 text-left">
                    {step.bullets.map((line) => (
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
          Пройти тест кожи
        </Link>
        <Link
          to="/shop"
          className="w-full rounded-full border border-slate-200 bg-white px-8 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand sm:w-auto"
        >
          В каталог
        </Link>
      </div>
    </main>
  );
};
