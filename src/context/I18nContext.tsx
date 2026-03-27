import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type AppLanguage = 'ru' | 'en';
export type AppCurrency = 'RUB' | 'USD' | 'KZT' | 'UZS';
export type AppCountry = 'RU' | 'KZ' | 'UZ';

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
  const hydratedRef = useRef(false);
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
      if (savedCountry === 'RU' || savedCountry === 'KZ' || savedCountry === 'UZ') setCountry(savedCountry);
      if (savedLang === 'ru' || savedLang === 'en') setLanguage(savedLang);
      if (savedCurrency === 'RUB' || savedCurrency === 'USD' || savedCurrency === 'KZT' || savedCurrency === 'UZS') {
        setCurrency(savedCurrency);
      }
      // 요청: AED(현재 타입 없음) / KZT는 제거 방향 — KZT가 저장돼 있으면 USD로 흡수
      if (savedCurrency === 'KZT') setCurrency('USD');
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
              // KZT 제거 방향: KZ라도 USD로 시작
              setCurrency('USD');
              return;
            }
            if (cc === 'UZ') {
              if (userInteractedRef.current) return;
              setCountry('UZ');
              setLanguage('ru');
              // UZS는 유지
              setCurrency('UZS');
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
      // 초기 hydrating(로컬스토리지 읽기/자동설정) 완료 전에는
      // 다른 effect에서 localStorage를 기본값으로 덮어쓰지 않도록 한다.
      hydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      localStorage.setItem(LANG_KEY, language);
      localStorage.setItem(CURRENCY_KEY, currency);
      localStorage.setItem(COUNTRY_KEY, country);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = language;
  }, [language, currency, country]);

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

