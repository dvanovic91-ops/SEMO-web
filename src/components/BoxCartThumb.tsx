import React from 'react';

/**
 * 장바구니/미니카트 — 커스텀 박스 아이콘 썸네일 (제품사진 대신).
 * 기본 박스: 브랜드 오렌지 / 프리미엄 박스: 앰버(골드) + 스파클.
 */
export const BoxCartThumb: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  const stroke = {
    stroke: 'currentColor',
    strokeWidth: 2.2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  return (
    <span
      className={`flex h-full w-full items-center justify-center ${
        premium ? 'bg-amber-50 text-amber-600' : 'bg-brand-soft text-brand'
      }`}
    >
      <svg viewBox="0 0 48 48" aria-hidden className="h-3/5 w-3/5">
        {/* 몸통 + 열린 뚜껑 */}
        <path d="M13 24h22v14H13z" {...stroke} />
        <path d="M24 24v14" {...stroke} />
        <path d="M13 24 7 18l17-3 17 3-6 6" {...stroke} />
        {premium && (
          <>
            <path d="M24 4l1.4 3.6L29 9l-3.6 1.4L24 14l-1.4-3.6L19 9l3.6-1.4L24 4Z" fill="currentColor" stroke="none" />
            <path d="M35 8l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1 1-2.4Z" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </span>
  );
};

/** 커스텀 박스 아이템인지 (기본/프리미엄 공통 prefix) */
export const isCustomBoxId = (id: string) => id.startsWith('custom-build-box');
/** 프리미엄 박스인지 */
export const isPremiumBoxId = (id: string) => id === 'custom-build-box-premium';
