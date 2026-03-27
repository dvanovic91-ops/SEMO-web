import type { AppCountry, AppCurrency, AppLanguage } from '../context/I18nContext';

export const COUNTRY_DEFAULT_LANGUAGE: Record<AppCountry, AppLanguage> = {
  RU: 'ru',
  KZ: 'ru',
  UZ: 'ru',
};

export const COUNTRY_DEFAULT_CURRENCY: Record<AppCountry, AppCurrency> = {
  RU: 'RUB',
  KZ: 'KZT',
  UZ: 'UZS',
};

export const COUNTRY_ADDRESS_SEARCH_HINT: Record<AppCountry, string> = {
  RU: 'Введите адрес на русском',
  KZ: 'Введите адрес (RU/EN)',
  UZ: 'Введите адрес (RU/UZ)',
};

export function resolveDefaultMarket(country: AppCountry) {
  return {
    language: COUNTRY_DEFAULT_LANGUAGE[country],
    currency: COUNTRY_DEFAULT_CURRENCY[country],
  };
}
