import React from 'react';

/**
 * 앱 레이아웃 기준 «보이는 본문 슬롯» 정중앙 — 고정 Navbar·모바일 하단 탭바를 제외한 영역에 flex 중앙.
 * (문서 흐름 + py만 쓰면 페이지마다 위·아래로 어긋남 → 항상 동일 fixed 박스)
 * z-[80]: Navbar(z-40)보다 위(본문 위에 덮음), 일반 모달(z-100) 아래.
 */
export const SEMO_VIEWPORT_LOADING_OVERLAY_CLASS =
  'fixed left-0 right-0 z-[80] flex w-full flex-col items-center justify-center bg-white px-4 sm:px-6 ' +
  'top-[var(--semo-mobile-header-h)] bottom-[var(--semo-mobile-tabbar-h)] ' +
  'md:bottom-0 md:top-[var(--semo-desktop-header-h)]';

/** `<main>` 전체 로딩 — AuthInitializingScreen·Login·상세 등 */
export const SEMO_FULL_PAGE_LOADING_MAIN_CLASS = SEMO_VIEWPORT_LOADING_OVERLAY_CLASS;

/** 섹션/페이지 일부 로딩도 동일 오버레이로 위치 통일 (Promo·프로필 목록 등) */
export const SEMO_SECTION_LOADING_CLASS = SEMO_VIEWPORT_LOADING_OVERLAY_CLASS;

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
