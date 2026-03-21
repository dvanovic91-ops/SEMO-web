/**
 * ProfileEdit «Доставка»와 Checkout 배송 블록에서 동일한 Tailwind 클래스를 쓰기 위한 공통 정의.
 */

export const deliveryFormInputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';

export const deliveryFormHintClass = 'text-[11px] text-slate-500 font-normal';

export const deliveryFormFieldColClass = 'flex min-w-0 flex-col gap-1';
export const deliveryFormFioCellClass = 'flex min-h-0 min-w-0 flex-col gap-1';
export const deliveryFormFieldLabelClass = 'block text-sm font-medium text-slate-700';

const deliveryContactInputBase =
  'w-full min-w-0 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:outline-none';

export const deliveryContactInputLocked = `${deliveryContactInputBase} cursor-default !bg-slate-200 text-slate-600 focus:ring-0`;
export const deliveryContactInputEditable = `${deliveryContactInputBase} bg-white focus:border-brand focus:ring-1 focus:ring-brand`;
export const deliveryContactInputEmailPending = `${deliveryContactInputBase} cursor-default bg-slate-50 text-slate-800 focus:border-brand focus:ring-1 focus:ring-brand`;
