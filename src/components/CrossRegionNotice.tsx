import React, { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { SEMO_DOMAINS, crossRegionTarget, detectVisitorCountry, isOnSemoProdHost } from '../lib/geoRegion';

/**
 * 크로스리전 안내 배너 (지오라우팅 안전망).
 *
 * 비활성 기본값: `VITE_CROSS_REGION_NOTICE=on` 일 때만 동작한다.
 * → 러시아(.ru) 백엔드가 준비되기 전에는 켜지 않는다(죽은 도메인으로 안내 방지).
 *
 * 동작: 방문자 국가를 추정해, 더 알맞은 리전 사이트가 있으면 상단에 안내 배너를 띄운다.
 * - 글로벌(.com)에 온 러시아/벨라루스 사용자 → semo-box.ru 로 안내
 * - .ru 에 온 그 외 국가 사용자 → semo-box.com 로 안내
 */
const ENABLED = (import.meta.env.VITE_CROSS_REGION_NOTICE ?? '').trim().toLowerCase() === 'on';

export const CrossRegionNotice: React.FC = () => {
  const { language } = useI18n();
  const [target, setTarget] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!ENABLED || !isOnSemoProdHost()) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 2500);
    void (async () => {
      const cc = await detectVisitorCountry(controller.signal);
      const t = crossRegionTarget(cc);
      if (!t) return;
      const key = `semo_cross_region_dismissed_${t}`;
      try {
        if (localStorage.getItem(key) === '1') return;
      } catch {
        /* ignore */
      }
      setTarget(t);
    })();
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  if (!target || dismissed) return null;

  const toRu = target === SEMO_DOMAINS.ru;
  const domainLabel = toRu ? 'semo-box.ru' : 'semo-box.com';

  const text = toRu
    ? language === 'ru'
      ? 'Вы из России или Беларуси? Перейдите на semo-box.ru — цены в ₽ и локальная доставка.'
      : 'Shopping from Russia or Belarus? Use semo-box.ru — prices in ₽ and local delivery.'
    : language === 'ru'
      ? 'Международная доставка — на сайте semo-box.com.'
      : 'Looking for international shopping? Visit semo-box.com.';

  const cta = language === 'ru' ? `Перейти на ${domainLabel}` : `Go to ${domainLabel}`;

  const handleDismiss = () => {
    try {
      localStorage.setItem(`semo_cross_region_dismissed_${target}`, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div className="relative z-[60] flex items-center justify-center gap-3 bg-neutral-900 px-4 py-2 text-center text-xs text-white sm:text-sm">
      <span className="min-w-0">{text}</span>
      <a
        href={`${target}/?semo_entry=${toRu ? 'ru' : 'intl'}`}
        className="shrink-0 rounded-full bg-white px-3 py-1 font-semibold text-neutral-900 transition hover:bg-neutral-200"
      >
        {cta}
      </a>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
};
