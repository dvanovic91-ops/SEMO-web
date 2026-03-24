import React from 'react';
import { Link } from 'react-router-dom';

const sectionClass = 'scroll-mt-[calc(var(--semo-mobile-header-h,3.5rem)+0.75rem)] border-t border-slate-100 pt-10 first:border-t-0 first:pt-0';
const h2Class = 'text-lg font-semibold text-slate-900 sm:text-xl';

/**
 * Юридические документы — краткие заглушки; замените полным текстом после согласования с юристом.
 */
export const Legal: React.FC = () => {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Правовая информация
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          Ниже — базовые разделы. Актуальная редакция может обновляться; дата размещения указана в тексте.
        </p>
      </header>

      <nav className="mb-10 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <a href="#privacy" className="text-brand underline-offset-2 hover:underline">
          Персональные данные
        </a>
        <a href="#terms" className="text-brand underline-offset-2 hover:underline">
          Пользовательское соглашение
        </a>
        <a href="#delivery" className="text-brand underline-offset-2 hover:underline">
          Доставка
        </a>
        <Link to="/support" className="text-slate-500 underline-offset-2 hover:underline">
          FAQ
        </Link>
      </nav>

      <section id="privacy" className={sectionClass}>
        <h2 className={h2Class}>Обработка персональных данных</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Оператор обрабатывает персональные данные (в т.ч. email, имя, телефон, адрес доставки) в целях
          регистрации, оформления и исполнения заказов, уведомлений о статусе заказа и поддержки клиентов.
          Передача третьим лицам — только в объёме, необходимом для доставки и таможенного оформления, либо
          по требованию закона. Вы вправе запросить уточнение, исправление или удаление данных через службу
          поддержки. Полный текст политики будет размещён здесь после юридического согласования.
        </p>
      </section>

      <section id="terms" className={sectionClass}>
        <h2 className={h2Class}>Пользовательское соглашение</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Используя сайт и сервис SEMO box, вы обязуетесь предоставлять достоверные данные, не нарушать
          работу сайта и соблюдать правила оформления заказов и оплаты. Интеллектуальная собственность
          контента сайта принадлежит правообладателям. Подробные условия будут дополнены полной редакцией
          соглашения.
        </p>
      </section>

      <section id="delivery" className={sectionClass}>
        <h2 className={h2Class}>Условия доставки</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Доставка осуществляется из Кореи в Россию; сроки и этапы зависят от логистики и таможни.
          Стоимость и способы доставки отображаются при оформлении заказа. Подробные ответы — в разделе{' '}
          <Link to="/support" className="font-medium text-brand underline underline-offset-2 hover:opacity-90">
            FAQ
          </Link>
          .
        </p>
      </section>
    </main>
  );
};
