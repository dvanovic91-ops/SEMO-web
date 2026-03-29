import type { AppCountry, AppCurrency, AppLanguage } from '../context/I18nContext';

export type StorefrontDateLocaleInput = {
  language: AppLanguage;
  country: AppCountry;
  currency: AppCurrency;
};

/** 언어·국가·화폐에 맞는 달력 로케일(숫자 날짜) */
function resolveDateLocale(input: StorefrontDateLocaleInput): string {
  const { language, country, currency } = input;
  if (language === 'ru' || country === 'RU') return 'ru-RU';
  if (language === 'en') {
    if (currency === 'USD' || country === 'AE') return 'en-US';
    return 'en-GB';
  }
  return 'ru-RU';
}

const DATE_NUMERIC: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
};

/**
 * 리뷰 등 스토어 노출용 날짜.
 * - ru / RU: 일·월·연 순(ru-RU, 예: 03.04.2026)
 * - en + USD·AE: 월/일/연(en-US)
 * - 그 외 en: 일/월/연(en-GB)
 */
export function formatStorefrontDate(iso: string | Date, input: StorefrontDateLocaleInput): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(resolveDateLocale(input), DATE_NUMERIC);
}

/** 알림 등 짧은 날짜+시간 */
export function formatStorefrontDateTimeShort(iso: string | Date, input: StorefrontDateLocaleInput): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const loc = resolveDateLocale(input);
  return d.toLocaleString(loc, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
