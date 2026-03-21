/**
 * Telegram / Email статус — ЛК, оформление заказа, редактирование профиля.
 * Два столбца: одинаковая ширина кнопок (grid 1fr 1fr), белый фон, бренд-бордер.
 */
export const accountStatusPillClass =
  'flex min-h-11 w-full cursor-default items-center justify-center whitespace-nowrap rounded-xl border border-brand/35 bg-white/90 px-2.5 py-2.5 text-center text-[11px] font-semibold text-brand shadow-sm sm:px-3 sm:text-xs';

export const accountPrimaryCtaClass =
  'flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl bg-brand px-2 py-2.5 text-center text-xs font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand/90 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60';

/** Контейнер двух равных колонок под карточкой */
export const accountLinkTwoColGridClass = 'grid grid-cols-2 gap-x-2 gap-y-2 sm:gap-x-4';
