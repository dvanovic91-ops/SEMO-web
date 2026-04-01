import React from 'react';

const TOOLTIP_RU = 'Узнать свой ИНН можно в приложении Госуслуги или на сайте nalog.ru';
const TOOLTIP_EN =
  'You can find your taxpayer ID (INN) in the Gosuslugi app or on the tax service website for your country.';

/**
 * INN 라벨 옆 ? 동그라미 아이콘 — 호버 시 에르메스 오렌지 작은 글씨 툴팁.
 */
export const InnHelpTooltip: React.FC<{ locale?: 'ru' | 'en' }> = ({ locale = 'ru' }) => {
  const text = locale === 'en' ? TOOLTIP_EN : TOOLTIP_RU;
  return (
    <span className="group relative ml-0.5 inline-flex cursor-help" aria-label={text}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-medium transition hover:border-brand hover:text-brand">
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 inline-block w-max max-w-[min(100vw-2rem,20rem)] -translate-x-1/2 whitespace-normal rounded px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-brand bg-white shadow-md border border-slate-100 opacity-0 transition group-hover:opacity-100">
        {text}
      </span>
    </span>
  );
};
