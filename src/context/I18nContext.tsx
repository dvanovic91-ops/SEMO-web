import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { IS_RU_REGION } from '../lib/siteRegion';

export type AppLanguage = 'ru' | 'en';
export type AppCurrency = 'RUB' | 'USD' | 'KZT' | 'UZS';
export type AppCountry = 'RU' | 'KZ' | 'UZ' | 'AE';

type I18nContextValue = {
  country: AppCountry;
  language: AppLanguage;
  currency: AppCurrency;
  setCountry: (next: AppCountry) => void;
  setLanguage: (next: AppLanguage) => void;
  setCurrency: (next: AppCurrency) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const COUNTRY_KEY = 'semo_country';

const FIXED_LANG: AppLanguage = IS_RU_REGION ? 'ru' : 'en';
const FIXED_CURRENCY: AppCurrency = IS_RU_REGION ? 'RUB' : 'USD';
const DEFAULT_COUNTRY: AppCountry = IS_RU_REGION ? 'RU' : 'AE';

const noop = () => { /* region-locked */ };

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language] = useState<AppLanguage>(FIXED_LANG);
  const [currency] = useState<AppCurrency>(FIXED_CURRENCY);
  const [country, setCountry] = useState<AppCountry>(() => {
    try {
      const saved = localStorage.getItem(COUNTRY_KEY);
      if (saved === 'RU' || saved === 'KZ' || saved === 'UZ' || saved === 'AE') return saved as AppCountry;
    } catch { /* ignore */ }
    return DEFAULT_COUNTRY;
  });

  useEffect(() => {
    document.documentElement.lang = FIXED_LANG;
  }, []);

  useEffect(() => {
    try { localStorage.setItem(COUNTRY_KEY, country); } catch { /* ignore */ }
  }, [country]);

  const value = useMemo(
    () => ({
      country,
      language,
      currency,
      setCountry,
      setLanguage: noop,
      setCurrency: noop,
    }),
    [country, language, currency],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
