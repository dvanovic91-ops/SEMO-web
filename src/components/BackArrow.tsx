import React from 'react';

/**
 * 메인 화면 반짝이는 화살표(▼)를 왼쪽으로 회전한 뒤로가기 아이콘.
 * 전 페이지에서 회색 ← 대신 통일 사용.
 */
export const BackArrow: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-block text-brand animate-shine ${className}`}
    style={{ fontSize: '1rem', transform: 'rotate(-90deg)', lineHeight: 1 }}
    aria-hidden
  >
    ▼
  </span>
);
