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
  <div className="mt-2 -mx-4 w-[calc(100%+2rem)] text-[7px] font-medium leading-[1.35] tracking-tight text-red-600 sm:text-[8px] md:text-[9px] lg:text-xs lg:leading-snug">
    {CUSTOMS_PASSPORT_NOTICE_LINES_RU.map((line, i) => (
      <div
        key={i}
        className={`flex justify-center overflow-x-auto [-webkit-overflow-scrolling:touch] ${i > 0 ? 'mt-1.5' : ''}`}
      >
        <p className="whitespace-nowrap text-center">{line}</p>
      </div>
    ))}
  </div>
);
