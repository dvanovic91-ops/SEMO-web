/**
 * ProfileEdit «Доставка»와 Checkout 배송 블록에서 동일한 Tailwind 클래스를 쓰기 위한 공통 정의.
 */

export const deliveryFormInputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';

export const deliveryFormHintClass = 'text-[11px] text-slate-500 font-normal';

export const deliveryFormFieldColClass = 'flex min-w-0 flex-col gap-1';
export const deliveryFormFioCellClass = 'flex min-h-0 min-w-0 flex-col gap-1';
export const deliveryFormFieldLabelClass = 'block text-sm font-medium text-slate-700';

/** Доставка: внешний стек (FIO → … → паспорт) — min-w-0 чтобы flex-родитель не резал overflow-x-auto у подсказок */
export const deliveryFormSectionStackClass = 'flex min-w-0 flex-col gap-4';

/** Внутренняя карточка с brand border (одинаковая ширина на ProfileEdit и Checkout) */
export const deliveryFormInnerCardClass =
  'flex min-w-0 flex-col gap-4 rounded-xl border border-brand/20 bg-brand-soft/10 px-4 py-4';

const deliveryContactInputBase =
  'w-full min-w-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:outline-none';

export const deliveryContactInputLocked = `${deliveryContactInputBase} cursor-default !bg-slate-200 text-slate-600 focus:ring-0`;
export const deliveryContactInputEditable = `${deliveryContactInputBase} bg-white focus:border-brand focus:ring-1 focus:ring-brand`;
export const deliveryContactInputEmailPending = `${deliveryContactInputBase} cursor-default bg-slate-50 text-slate-800 focus:border-brand focus:ring-1 focus:ring-brand`;

/**
 * Телефон / email подсказка (* …) — одна строка; скролл на внутренней колонке (flex-1 min-w-0), иначе родитель overflow-x-hidden режет текст.
 */
export const deliveryFormNoteRowClass =
  'flex w-full min-w-0 items-start gap-1 text-gray-500 max-sm:text-[clamp(7px,2.65vw,9.5px)] sm:text-[10px] leading-tight';

/** Текстовая колонка — здесь overflow-x-auto, чтобы строка не обрезалась у края карточки */
export const deliveryFormNoteScrollClass =
  'min-w-0 flex-1 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] sm:overflow-x-visible';

export const deliveryFormNoteTextClass = 'block w-max max-w-none whitespace-nowrap leading-[inherit]';
