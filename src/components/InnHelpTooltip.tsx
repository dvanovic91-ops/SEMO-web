import React from 'react';

const TOOLTIP_TEXT =
  'Узнать свой ИНН можно в приложении Госуслуги или на сайте nalog.ru';

/**
 * INN 라벨 옆 ? 동그라미 아이콘 — 호버 시 에르메스 오렌지 작은 글씨 툴팁.
 */
export const InnHelpTooltip: React.FC = () => (
  <span className="group relative ml-0.5 inline-flex cursor-help" aria-label={TOOLTIP_TEXT}>
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-medium transition hover:border-brand hover:text-brand">
      ?
    </span>
    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 inline-block w-max -translate-x-1/2 whitespace-nowrap rounded px-2.5 py-1.5 text-left text-xs font-medium leading-none text-brand bg-white shadow-md border border-slate-100 opacity-0 transition group-hover:opacity-100">
      {TOOLTIP_TEXT}
    </span>
  </span>
);
