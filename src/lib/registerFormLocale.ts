import { useEffect, useState } from 'react';

const CIS_IP = new Set(['RU', 'KZ', 'UZ']);
const IP_CACHE_KEY = 'semo_register_ip_cc';

/** 브라우저 우선 언어 목록에 ru / uz / kk(카자흐) 가 있는지 */
export function browserLanguagesIncludeCisScript(): boolean {
  if (typeof navigator === 'undefined') return false;
  const list = navigator.languages?.length ? [...navigator.languages] : [navigator.language];
  return list.some((raw) => {
    const l = (raw || '').toLowerCase();
    return l.startsWith('ru') || l.startsWith('uz') || l.startsWith('kk');
  });
}

/**
 * 회원가입 폼 언어: (브라우저 ru|uz|kk) AND (IP RU|KZ|UZ) 일 때만 ru, 그 외 en.
 * IP 확인 전에는 en (조건이 확정될 때까지).
 */
export function useRegisterFormLang(): 'ru' | 'en' {
  const [ipCc, setIpCc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const cached = sessionStorage.getItem(IP_CACHE_KEY);
      if (cached) {
        setIpCc(cached);
        return;
      }
    } catch {
      /* ignore */
    }

    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 2500);
    void fetch('https://ipapi.co/json/', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { country_code?: string } | null) => {
        if (cancelled) return;
        const cc = (data?.country_code ?? '').toUpperCase() || 'ZZ';
        setIpCc(cc);
        try {
          sessionStorage.setItem(IP_CACHE_KEY, cc);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (!cancelled) setIpCc('ZZ');
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  if (ipCc === null) return 'en';
  const browserOk = browserLanguagesIncludeCisScript();
  const ipOk = CIS_IP.has(ipCc);
  return browserOk && ipOk ? 'ru' : 'en';
}
