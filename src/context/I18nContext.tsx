import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

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

const LANG_KEY = 'semo_lang';
const CURRENCY_KEY = 'semo_currency';
const COUNTRY_KEY = 'semo_country';

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [country, setCountry] = useState<AppCountry>('RU');
  const [language, setLanguage] = useState<AppLanguage>('ru');
  const [currency, setCurrency] = useState<AppCurrency>('RUB');
  /** localStorage 초기 읽기가 끝나기 전에는 저장 effect가 돌면 안 됨 — 기본값 ru/RUB 로 덮어쓰는 레이스 방지 */
  const [storageLoaded, setStorageLoaded] = useState(false);
  // 사용자가 직접 언어/통화를 변경한 뒤에는, IP 기반 자동설정이 늦게 도착해 값을 덮어쓰지 않도록 막는다.
  const userInteractedRef = useRef(false);

  const setLanguageSafe = (next: AppLanguage) => {
    userInteractedRef.current = true;
    setLanguage(next);
  };

  const setCurrencySafe = (next: AppCurrency) => {
    userInteractedRef.current = true;
    setCurrency(next);
  };

  const setCountrySafe = (next: AppCountry) => {
    userInteractedRef.current = true;
    setCountry(next);
  };

  useEffect(() => {
    try {
      const savedLang = localStorage.getItem(LANG_KEY);
      const savedCurrency = localStorage.getItem(CURRENCY_KEY);
      const savedCountry = localStorage.getItem(COUNTRY_KEY);
      if (savedCountry === 'RU' || savedCountry === 'KZ' || savedCountry === 'UZ' || savedCountry === 'AE') setCountry(savedCountry as AppCountry);
      if (savedLang === 'ru' || savedLang === 'en') setLanguage(savedLang);
      if (savedCurrency === 'RUB' || savedCurrency === 'USD' || savedCurrency === 'KZT' || savedCurrency === 'UZS') {
        setCurrency(savedCurrency);
      }
      // 첫 방문자(저장값 없음)만 IP 국가 기반 자동 기본값 적용
      if (!savedLang && !savedCurrency && !savedCountry) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 1800);
        void fetch('https://ipapi.co/json/', { signal: controller.signal })
          .then((r) => (r.ok ? r.json() : null))
          .then((data: { country_code?: string } | null) => {
            const cc = (data?.country_code ?? '').toUpperCase();
            if (cc === 'RU') {
              if (userInteractedRef.current) return;
              setCountry('RU');
              setLanguage('ru');
              setCurrency('RUB');
              return;
            }
            if (cc === 'KZ') {
              if (userInteractedRef.current) return;
              setCountry('KZ');
              setLanguage('ru');
              setCurrency('KZT');
              return;
            }
            if (cc === 'UZ') {
              if (userInteractedRef.current) return;
              setCountry('UZ');
              setLanguage('ru');
              setCurrency('UZS');
              return;
            }
            if (cc === 'AE') {
              if (userInteractedRef.current) return;
              setCountry('AE');
              setLanguage('en');
              setCurrency('USD');
              return;
            }
            // 기타 국가는 영어/달러로 시작
            if (userInteractedRef.current) return;
            setLanguage('en');
            setCurrency('USD');
          })
          .catch(() => {
            /* network ignore */
          })
          .finally(() => window.clearTimeout(timeout));
      }
    } catch {
      /* ignore */
    } finally {
      setStorageLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!storageLoaded) return;
    try {
      localStorage.setItem(LANG_KEY, language);
      localStorage.setItem(CURRENCY_KEY, currency);
      localStorage.setItem(COUNTRY_KEY, country);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = language;
  }, [language, currency, country, storageLoaded]);

  const value = useMemo(
    () => ({
      country,
      language,
      currency,
      setCountry: setCountrySafe,
      setLanguage: setLanguageSafe,
      setCurrency: setCurrencySafe,
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

