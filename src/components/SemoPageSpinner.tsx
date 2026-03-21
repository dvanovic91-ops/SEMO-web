import React from 'react';

/** 피부테스트(skinLimitLoading) 전체 화면과 동일 — 위치·여백·중앙 정렬 */
export const SEMO_FULL_PAGE_LOADING_MAIN_CLASS =
  'mx-auto flex min-h-[100dvh] w-full flex-col items-center justify-center bg-white px-4 py-5 sm:min-h-screen sm:px-6 sm:py-10 md:py-14';

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
