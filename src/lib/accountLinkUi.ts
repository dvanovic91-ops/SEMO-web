/**
 * Telegram / Email статус — ЛК, оформление заказа, редактирование профиля.
 * Два столбца: одинаковая ширина кнопок (grid 1fr 1fr), белый фон, бренд-бордер.
 */
export const accountStatusPillClass =
  'flex min-h-11 w-full cursor-default items-center justify-center whitespace-nowrap rounded-xl border border-brand/35 bg-white/90 px-2.5 py-2.5 text-center text-[11px] font-semibold text-brand shadow-sm sm:px-3 sm:text-xs';

/** 가로 한 줄(전화+버튼)에 쓸 때는 w-full 없음 — 부모에서 필요 시 `w-full` 추가 */
export const accountPrimaryCtaClass =
  'inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-xl bg-brand px-3 py-2.5 text-center text-xs font-semibold text-white shadow-md shadow-brand/25 transition hover:bg-brand/90 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60';

/** 인증 메일 재전송 — 쿨다운 중 비활성(흰 배경·주황 테두리) */
export const accountResendOutlineCtaClass =
  'flex min-h-11 w-full items-center justify-center whitespace-nowrap rounded-xl border border-brand bg-white px-2 py-2.5 text-center text-xs font-semibold text-brand transition hover:bg-brand/5 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-white';

/** Контейнер двух равных колонок под карточкой */
export const accountLinkTwoColGridClass = 'grid grid-cols-2 gap-x-2 gap-y-2 sm:gap-x-4';

/**
 * Подсказка под кнопкой в колонке Telegram | Email (узкая ширина на мобильном).
 * max-sm: уменьшенный кегль, чтобы фраза уместилась в одну строку.
 */
export const accountCardSubtextClass =
  'prose-ru mx-auto mt-3 max-w-none text-center font-normal tracking-tight text-[#6B7280] text-[7px] leading-tight sm:text-[9px] sm:leading-snug md:text-[10px]';

/** Теглайн сразу под кнопкой «Привязать Telegram». */
export const accountTelegramLinkTaglineClass =
  'prose-ru mx-auto mt-3 max-w-none text-center font-normal tracking-tight text-slate-700 text-[7px] leading-tight sm:text-[9px] sm:leading-snug md:text-[10px]';

/** Строка про +200 баллов (под теглайном). */
export const accountTelegramLinkOfferClass =
  'prose-ru mx-auto mt-1.5 max-w-none text-center font-normal tracking-tight text-[#6B7280] text-[7px] leading-tight sm:text-[9px] sm:leading-snug md:text-[10px]';
