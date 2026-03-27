import type { AppCurrency } from '../context/I18nContext';

const CURRENCY_LOCALE: Record<AppCurrency, string> = {
  RUB: 'ru-RU',
  KZT: 'kk-KZ',
  USD: 'en-US',
  UZS: 'uz-UZ',
};

const CURRENCY_SYMBOL: Record<AppCurrency, string> = {
  RUB: '₽',
  KZT: '₸',
  USD: '$',
  UZS: 'сўм',
};

export function formatCurrencyAmount(amount: number, currency: AppCurrency): string {
  const rounded = Number.isFinite(amount) ? amount : 0;
  return `${rounded.toLocaleString(CURRENCY_LOCALE[currency], { maximumFractionDigits: 0 })} ${CURRENCY_SYMBOL[currency]}`;
}
