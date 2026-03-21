import React from 'react';

/** ИНН / паспорт — таможня (3 строки, по центру) */
export const CUSTOMS_PASSPORT_NOTICE_LINES_RU = [
  'Обратите внимание:',
  'корректность данных для таможни — ответственность получателя (ст. 84 ТК ЕАЭС).',
  'Пожалуйста, проверьте данные перед сохранением, чтобы избежать задержек.',
] as const;

/** Одна строка — поиск/логи при необходимости */
export const CUSTOMS_PASSPORT_NOTICE_RU = CUSTOMS_PASSPORT_NOTICE_LINES_RU.join(' ');

/**
 * Родитель с `px-4`: выходим на полную ширину карточки; каждая строка — одна логическая строка (nowrap),
 * на узком экране при необходимости — горизонтальный скролл строки.
 */
export const CustomsPassportNotice: React.FC = () => (
  <div className="mt-2 -mx-4 w-[calc(100%+2rem)] px-1 text-[8.5px] font-medium leading-snug tracking-tight text-red-600 sm:px-0 sm:text-[10.5px] sm:leading-[1.35] md:text-[11.5px] md:leading-snug lg:text-[12.5px] lg:leading-snug">
    {CUSTOMS_PASSPORT_NOTICE_LINES_RU.map((line, i) => (
      <div
        key={i}
        className={`flex w-full min-w-0 justify-center max-sm:overflow-visible sm:overflow-x-auto [-webkit-overflow-scrolling:touch] ${i > 0 ? 'mt-1 sm:mt-1.5' : ''}`}
      >
        <p className="w-full max-w-full text-center break-words text-balance max-sm:whitespace-normal sm:whitespace-nowrap">
          {line}
        </p>
      </div>
    ))}
  </div>
);
