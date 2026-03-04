import React from 'react';

/**
 * 뒤로가기/이전 단계용 왼쪽 방향 삼각형 화살표.
 * 색상·크기는 브랜드 톤으로, 인접 텍스트와 시각적으로 한 묶음으로 쓰기 위함.
 */
export const BackArrow: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center justify-center text-brand animate-shine ${className}`}
    style={{ width: '1em', height: '1em', lineHeight: 1 }}
    aria-hidden
  >
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="block"
    >
      {/* 왼쪽을 가리키는 삼각형 (꼭지점이 왼쪽) */}
      <path d="M15.5 5.5L8 12l7.5 6.5V5.5z" />
    </svg>
  </span>
);
