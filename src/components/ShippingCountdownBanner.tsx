import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';

const TruckIcon = ({ color }: { color: string }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <circle cx="7" cy="17" r="2" />
    <circle cx="17" cy="17" r="2" />
    <path d="M5 17h-2v-4m-1 -8h11v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
    <path d="M3 9h4" />
  </svg>
);

const DEFAULT_DAYS = [15, 30];

function getNextShippingDate(deadlineDays: number[]): Date {
  const now = new Date();
  const candidates: Date[] = [];
  for (let mo = 0; mo <= 1; mo++) {
    const y = now.getMonth() + mo > 11 ? now.getFullYear() + 1 : now.getFullYear();
    const m = (now.getMonth() + mo) % 12;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    for (const day of deadlineDays) {
      const d = new Date(y, m, Math.min(day, daysInMonth), 23, 59, 59, 0);
      if (d.getTime() > now.getTime()) candidates.push(d);
    }
  }
  return candidates.sort((a, b) => a.getTime() - b.getTime())[0]!;
}

export const ShippingCountdownBanner: React.FC = () => {
  const { language } = useI18n();
  const { pathname } = useLocation();
  const isEn = language === 'en';

  const [deadlineDays, setDeadlineDays] = useState<number[]>(DEFAULT_DAYS);
  const [target, setTarget] = useState<Date>(() => getNextShippingDate(DEFAULT_DAYS));
  const [diff, setDiff] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'shipping_deadline_days')
      .maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return;
        const days = (data.value as string)
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31)
          .sort((a, b) => a - b);
        if (days.length) {
          setDeadlineDays(days);
          setTarget(getNextShippingDate(days));
        }
      });
  }, []);

  useEffect(() => {
    setDiff(target.getTime() - Date.now());
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 30_000);
    return () => clearInterval(id);
  }, [target]);

  if (pathname.startsWith('/admin')) return null;

  const totalMins = Math.max(0, Math.floor(diff / 60_000));
  const days = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins = totalMins % 60;
  const isUrgent = days < 3;

  const dateStr = target.toLocaleDateString(isEn ? 'en-US' : 'ru-RU', {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  });

  const bannerBase = 'fixed left-0 right-0 z-[39] flex h-[var(--semo-shipping-banner-h)] items-center justify-center px-4 top-[var(--semo-mobile-header-h)] md:top-[var(--semo-desktop-header-h)]';

  if (isUrgent) {
    return (
      <div className={`${bannerBase} gap-3 border-b border-[#F0997B] bg-[#FAECE7]`} aria-live="polite">
        <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F5C4B3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <TruckIcon color="#993C1D" />
        </div>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: '#993C1D', fontWeight: 500, whiteSpace: 'nowrap' }}>
            {isEn ? 'Shipping soon' : 'Скоро отправка'}
          </span>
          <span style={{ fontSize: 18, fontWeight: 500, color: '#712B13', fontVariantNumeric: 'tabular-nums' }}>{String(days).padStart(2, '0')}</span>
          <span style={{ fontSize: 11, color: '#993C1D' }}>{isEn ? 'd' : 'д'}</span>
          <span style={{ fontSize: 18, fontWeight: 500, color: '#712B13', fontVariantNumeric: 'tabular-nums' }}>{String(hours).padStart(2, '0')}</span>
          <span style={{ fontSize: 11, color: '#993C1D' }}>{isEn ? 'h' : 'ч'}</span>
          <span style={{ fontSize: 18, fontWeight: 500, color: '#712B13', fontVariantNumeric: 'tabular-nums' }}>{String(mins).padStart(2, '0')}</span>
          <span style={{ fontSize: 11, color: '#993C1D' }}>{isEn ? 'm' : 'м'}</span>
        </div>
        <span style={{ background: '#F5C4B3', color: '#712B13', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, flexShrink: 0 }}>
          D-{days}
        </span>
      </div>
    );
  }

  return (
    <div className={`${bannerBase} gap-3 border-b border-slate-100 bg-white`}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <TruckIcon color="#94a3b8" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
          {isEn ? 'Next shipment deadline' : 'Следующая отправка'}
        </p>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: '#0f172a', marginTop: 1 }}>
          {dateStr}
        </p>
      </div>
      <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 99, flexShrink: 0 }}>
        {isEn ? `in ${days}d` : `через ${days} д.`}
      </span>
    </div>
  );
};
