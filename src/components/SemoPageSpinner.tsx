import React from 'react';

/**
 * 전체 화면 로딩 — 뷰포트 정중앙(모바일/데스크톱 공통).
 * 레이아웃 flex 자식 + 헤더 pt 때문에 문서 흐름만 쓰면 스피너가 화면 중앙보다 아래로 보임 → fixed inset-0 로 보정.
 * z-[80]: Navbar(z-40) 위, 일반 모달(z-100) 아래.
 */
export const SEMO_FULL_PAGE_LOADING_MAIN_CLASS =
  'fixed inset-0 z-[80] flex min-h-[100dvh] w-full flex-col items-center justify-center bg-white px-4 py-0 sm:px-6';

/**
 * 헤더·페이지 제목 아래 영역만 로딩 — 삼각형(h-12)·글자(text-sm)·gap-4는 동일, 세로만 확보
 */
export const SEMO_SECTION_LOADING_CLASS =
  'flex w-full flex-col items-center justify-center py-14 sm:py-16 min-h-[min(70vh,26rem)]';

export type SemoPageSpinnerProps = {
  className?: string;
  sizeClass?: string;
  showLabel?: boolean;
};

/**
 * 페이지·데이터 로딩 공통 UI — SEMO 삼각형 회전 (피부테스트 로딩과 동일 크기 기본 h-12 w-12)
 */
export function SemoPageSpinner({
  className = '',
  sizeClass = 'h-12 w-12',
  showLabel = true,
}: SemoPageSpinnerProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Загрузка"
    >
      <svg className={`${sizeClass} animate-spin text-brand`} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3L22 20H2L12 3Z" fill="currentColor" />
      </svg>
      {showLabel ? <p className="text-sm text-slate-500">Загрузка…</p> : null}
    </div>
  );
}

export function AuthInitializingScreen() {
  return (
    <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
      <SemoPageSpinner />
    </main>
  );
}
