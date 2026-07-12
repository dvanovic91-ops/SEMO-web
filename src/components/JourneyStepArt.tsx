import React from 'react';

/**
 * Journey to SEMO — 스텝별 아이콘 아트 패널 (사진 대체, Apple식 아이콘+텍스트).
 * 패널: brand-soft 그라데이션 + 코너 대형 세리프 숫자 워터마크 + 중앙 라인 아이콘.
 */

const STROKE = {
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none',
};

/** Step 1 — 피부 테스트 카드 + 매칭 스파클 */
const TestIcon = () => (
  <svg viewBox="0 0 96 96" aria-hidden className="h-full w-full">
    {/* 테스트 카드 */}
    <rect x="20" y="14" width="44" height="58" rx="6" {...STROKE} />
    {/* 체크 항목들 */}
    <circle cx="30" cy="28" r="2.4" fill="currentColor" stroke="none" />
    <path d="M38 28h18" {...STROKE} />
    <circle cx="30" cy="40" r="2.4" fill="currentColor" stroke="none" />
    <path d="M38 40h14" {...STROKE} />
    <circle cx="30" cy="52" r="2.4" fill="currentColor" stroke="none" />
    <path d="M38 52h16" {...STROKE} />
    {/* 매칭된 물방울 (결과) */}
    <path d="M72 50c6 8 9 12.5 9 17a9 9 0 0 1-18 0c0-4.5 3-9 9-17Z" {...STROKE} />
    {/* 스파클 */}
    <path d="M74 24l1.8 4.6L80.5 30l-4.7 1.4L74 36l-1.8-4.6L67.5 30l4.7-1.4L74 24Z" fill="currentColor" stroke="none" />
  </svg>
);

/** Step 2 — 방패 + 체크 (안전 결제·통관 안심) */
const SecureIcon = () => (
  <svg viewBox="0 0 96 96" aria-hidden className="h-full w-full">
    {/* 방패 */}
    <path d="M48 12l26 9v20c0 17-11 30-26 37-15-7-26-20-26-37V21l26-9Z" {...STROKE} />
    {/* 체크 */}
    <path d="M36 47l9 9 16-18" {...STROKE} strokeWidth={2.4} />
  </svg>
);

/** Step 3 — 소포 박스 → 점선 경로 → 위치 핀 (직배송·추적) */
const ShipIcon = () => (
  <svg viewBox="0 0 96 96" aria-hidden className="h-full w-full">
    {/* 소포 */}
    <rect x="6" y="46" width="38" height="34" rx="3" {...STROKE} />
    <path d="M6 58h38M25 46v12" {...STROKE} />
    {/* 점선 경로 */}
    <path d="M50 52C60 38 66 32 74 29" {...STROKE} strokeDasharray="1 7" strokeWidth={2.4} />
    {/* 위치 핀 */}
    <path d="M77 8a13 13 0 0 1 13 13c0 9.5-13 22-13 22S64 30.5 64 21A13 13 0 0 1 77 8Z" {...STROKE} />
    <circle cx="77" cy="21" r="4" {...STROKE} />
  </svg>
);

/** Step 4 — 열린 박스 + 떠오르는 스파클 (언박싱) */
const UnboxIcon = () => (
  <svg viewBox="0 0 96 96" aria-hidden className="h-full w-full">
    {/* 박스 몸통 */}
    <path d="M26 46h44v30H26z" {...STROKE} />
    <path d="M48 46v30" {...STROKE} />
    {/* 열린 뚜껑 */}
    <path d="M26 46 14 34l34-6 34 6-12 12" {...STROKE} />
    <path d="M48 28v18" {...STROKE} />
    {/* 스파클 */}
    <path d="M48 8l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="currentColor" stroke="none" />
    <path d="M70 16l1.4 3.4 3.4 1.4-3.4 1.4L70 25.6l-1.4-3.4-3.4-1.4 3.4-1.4L70 16Z" fill="currentColor" stroke="none" />
    <path d="M26 18l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2 1.2-3Z" fill="currentColor" stroke="none" />
  </svg>
);

const ICONS = [TestIcon, SecureIcon, ShipIcon, UnboxIcon];

type Props = {
  /** 0-based step index */
  index: number;
  /** 홈 랜딩은 패널 높이를 조금 낮게 */
  compact?: boolean;
};

export const JourneyStepArt: React.FC<Props> = ({ index, compact = false }) => {
  const Icon = ICONS[index % ICONS.length]!;
  const num = String(index + 1).padStart(2, '0');
  return (
    <div
      className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand-soft via-white to-brand-soft/40 ring-1 ring-inset ring-brand/[0.07] ${
        compact
          ? 'min-h-[200px] sm:min-h-[240px] md:min-h-[280px]'
          : 'min-h-[240px] sm:min-h-[300px] md:min-h-[340px] lg:min-h-[380px]'
      }`}
    >
      {/* 코너 대형 숫자 워터마크 */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-3 right-5 select-none font-sans text-[6rem] font-light leading-none tracking-tight text-brand/10 sm:text-[8rem] md:bottom-4 md:right-7 md:text-[10rem]"
      >
        {num}
      </span>
      {/* 라인 아이콘 */}
      <div className="h-32 w-32 text-brand sm:h-40 sm:w-40 md:h-48 md:w-48">
        <Icon />
      </div>
    </div>
  );
};
