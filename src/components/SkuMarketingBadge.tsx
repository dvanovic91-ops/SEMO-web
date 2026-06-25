import React from 'react';

export type MarketingBadgeType = 'youtuber_pick' | 'retail_top';

type Props = {
  badge: MarketingBadgeType;
  isEn?: boolean;
  /** 카드 이미지 위 오버레이 */
  variant?: 'overlay' | 'inline';
  className?: string;
};

export function getMarketingBadgeLabel(badge: MarketingBadgeType, isEn: boolean): string {
  if (badge === 'retail_top') {
    return isEn ? 'K-retail #1' : 'К-ретейл №1';
  }
  return isEn ? '1M YouTuber' : '1М ютубера';
}

function YoutuberIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      {/* gold outer ring */}
      <circle cx="20" cy="20" r="19.5" fill="#C9A84C" />
      {/* lighter gold rim */}
      <circle cx="20" cy="20" r="17" fill="#E8D49A" />
      {/* dark teal fill */}
      <circle cx="20" cy="20" r="14.5" fill="#1B4F5E" />
      {/* 5 stars arc */}
      <text x="20" y="14.5" textAnchor="middle" fill="#E8D49A" fontSize="6" fontFamily="Arial" letterSpacing="1.5">★ ★ ★ ★ ★</text>
      {/* red youtube circle + white play */}
      <circle cx="20" cy="25" r="6.5" fill="#FF0000" />
      <polygon points="17.5,22 17.5,28 23.5,25" fill="white" />
    </svg>
  );
}

function OliveYoungIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      {/* dark olive green bg */}
      <circle cx="18" cy="18" r="18" fill="#006341" />
      {/* three olive ovals — brand motif */}
      <ellipse cx="18" cy="9" rx="4" ry="5.5" fill="#4CAF83" />
      <ellipse cx="11.5" cy="14" rx="4" ry="5.5" fill="#4CAF83" transform="rotate(-30 11.5 14)" />
      <ellipse cx="24.5" cy="14" rx="4" ry="5.5" fill="#4CAF83" transform="rotate(30 24.5 14)" />
      {/* 1위 */}
      <text x="18" y="30" textAnchor="middle" fill="white" fontSize="10" fontFamily="Arial" fontWeight="bold">1위</text>
    </svg>
  );
}

export function SkuMarketingBadge({
  badge,
  isEn = false,
  variant = 'overlay',
  className = '',
}: Props) {
  const tooltip =
    badge === 'retail_top'
      ? '한국 뷰티 리테일 기준 1위'
      : '한국 뷰티 1위 유튜버 추천';

  const positionCls =
    variant === 'overlay' ? 'absolute left-1.5 top-1.5' : 'relative';

  return (
    <span className={`group inline-flex shrink-0 cursor-default ${positionCls} ${className}`}>
      {badge === 'retail_top' ? <OliveYoungIcon /> : <YoutuberIcon />}
      {/* tooltip */}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[10px] leading-tight text-white opacity-0 transition-opacity group-hover:opacity-100">
        {tooltip}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
}
