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

/**
 * 도메인 리다이렉트와 연동 (semo-box.ru → semo-box.com):
 * - 등록대행사/서버에서 `https://semo-box.com/?semo_entry=ru` 로내면 러시아 루트(러시아·루블·회원가입 국가 기본 RU).
 * - 명시적 글로벌 진입: `?semo_entry=intl` 또는 `?semo_entry=com` → 영어·달러·배송국 AE 기본(변경 가능).
 * 쿼리는 읽은 뒤 주소창에서 제거(replaceState)한다.
 * - 저장값 없는 첫 방문: `navigator.language` 가 ru* 이면 RU·руб·RU (IP 조회 생략).
 * - 얀덱스 OAuth 성공 시(YandexCallback): RU·ru·RUB 로 맞춤(헤더에서 변경 가능).
 */
const ENTRY_PARAM = 'semo_entry';

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  /** 첫 페인트: 글로벌(.com) 기본 — IP·저장값·semo_entry가 덮어씀 */
  const [country, setCountry] = useState<AppCountry>('AE');
  const [language, setLanguage] = useState<AppLanguage>('en');
  const [currency, setCurrency] = useState<AppCurrency>('USD');
  /** localStorage 초기 읽기가 끝나기 전에는 저장 effect가 돌면 안 됨 */
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
      const params = new URLSearchParams(window.location.search);
      const entryRaw = (params.get(ENTRY_PARAM) ?? '').trim().toLowerCase();
      if (entryRaw === 'ru') {
        userInteractedRef.current = true;
        setCountry('RU');
        setLanguage('ru');
        setCurrency('RUB');
        try {
          localStorage.setItem(LANG_KEY, 'ru');
          localStorage.setItem(CURRENCY_KEY, 'RUB');
          localStorage.setItem(COUNTRY_KEY, 'RU');
        } catch {
          /* ignore */
        }
        params.delete(ENTRY_PARAM);
        const qs = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
      } else if (entryRaw === 'intl' || entryRaw === 'com' || entryRaw === 'global') {
        userInteractedRef.current = true;
        setCountry('AE');
        setLanguage('en');
        setCurrency('USD');
        try {
          localStorage.setItem(LANG_KEY, 'en');
          localStorage.setItem(CURRENCY_KEY, 'USD');
          localStorage.setItem(COUNTRY_KEY, 'AE');
        } catch {
          /* ignore */
        }
        params.delete(ENTRY_PARAM);
        const qs = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
      }

      const savedLang = localStorage.getItem(LANG_KEY);
      const savedCurrency = localStorage.getItem(CURRENCY_KEY);
      const savedCountry = localStorage.getItem(COUNTRY_KEY);
      if (savedCountry === 'RU' || savedCountry === 'KZ' || savedCountry === 'UZ' || savedCountry === 'AE') setCountry(savedCountry as AppCountry);
      if (savedLang === 'ru' || savedLang === 'en') setLanguage(savedLang);
      if (savedCurrency === 'RUB' || savedCurrency === 'USD' || savedCurrency === 'KZT' || savedCurrency === 'UZS') {
        setCurrency(savedCurrency);
      }
      // 첫 방문자(저장값 없음): ru 로케일이면 RU·руб·RU, 아니면 IP 기반
      if (!savedLang && !savedCurrency && !savedCountry) {
        const navLang = (typeof navigator !== 'undefined' ? navigator.language || '' : '').toLowerCase();
        if (navLang.startsWith('ru')) {
          userInteractedRef.current = true;
          setCountry('RU');
          setLanguage('ru');
          setCurrency('RUB');
        } else {
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
              // 기타 국가는 영어/달러·배송국 AE(미등록 기본)로 시작
              if (userInteractedRef.current) return;
              setCountry('AE');
              setLanguage('en');
              setCurrency('USD');
            })
            .catch(() => {
              /* network ignore */
            })
            .finally(() => window.clearTimeout(timeout));
        }
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

