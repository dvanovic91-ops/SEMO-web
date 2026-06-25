import React from 'react';

export type MarketingBadgeType = 'youtuber_pick' | 'retail_top';

type Lang = 'ko' | 'en' | 'ru';

type Props = {
  badge: MarketingBadgeType;
  language?: Lang;
  /** @deprecated use language */
  isEn?: boolean;
  variant?: 'overlay' | 'inline';
  className?: string;
};

const LABELS: Record<MarketingBadgeType, Record<Lang, string>> = {
  youtuber_pick: {
    ko: '한국 1위 뷰티 유투버 D의 픽',
    en: "#1 K-Beauty YouTuber's Pick",
    ru: 'Выбор K-beauty блогера №1 в Корее',
  },
  retail_top: {
    ko: '한국 리테일 판매 1위',
    en: 'Korea Retail Sales #1',
    ru: 'Лидер розничных продаж Кореи',
  },
};

export function getMarketingBadgeLabel(badge: MarketingBadgeType, isEn: boolean): string {
  return LABELS[badge][isEn ? 'en' : 'ko'];
}

function YoutuberIcon() {
  return (
    <svg width="33" height="33" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="19.5" fill="#C9A84C" />
      <circle cx="20" cy="20" r="17" fill="#E8D49A" />
      <circle cx="20" cy="20" r="14.5" fill="#1B4F5E" />
      <text x="20" y="14.5" textAnchor="middle" fill="#E8D49A" fontSize="6" fontFamily="Arial" letterSpacing="1.5">★ ★ ★ ★ ★</text>
      <circle cx="20" cy="25" r="6.5" fill="#FF0000" />
      <polygon points="17.5,22 17.5,28 23.5,25" fill="white" />
    </svg>
  );
}

function OliveYoungIcon() {
  return (
    <svg width="33" height="33" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="18" fill="#006341" />
      <ellipse cx="18" cy="10" rx="4" ry="5.5" fill="#4CAF83" />
      <ellipse cx="12" cy="22" rx="4" ry="5.5" fill="#4CAF83" transform="rotate(-30 12 22)" />
      <ellipse cx="24" cy="22" rx="4" ry="5.5" fill="#4CAF83" transform="rotate(30 24 22)" />
    </svg>
  );
}

export function SkuMarketingBadge({
  badge,
  language,
  isEn,
  variant = 'overlay',
  className = '',
}: Props) {
  const lang: Lang = language ?? (isEn ? 'en' : 'ko');
  const tooltip = LABELS[badge][lang];
  const positionCls = variant === 'overlay' ? 'absolute left-1.5 top-1.5' : 'relative';

  return (
    <span className={`group/badge inline-flex shrink-0 cursor-default ${positionCls} ${className}`}>
      {badge === 'retail_top' ? <OliveYoungIcon /> : <YoutuberIcon />}
      <span className="pointer-events-none absolute top-0 left-full z-50 ml-2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] leading-tight text-white opacity-0 shadow-md transition-opacity group-hover/badge:opacity-100">
        {tooltip}
        <span className="absolute top-2 right-full border-4 border-transparent border-r-gray-900" />
      </span>
    </span>
  );
}
