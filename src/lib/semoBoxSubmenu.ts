/**
 * SEMO Box 드롭다운·모바일 하단 서브바·히스토리 라우트 판별에 공통 사용
 */
export type SemoBoxSubmenuItem = {
  to: string;
  label: string;
  /** 모바일 고정 상단 서브바 한 줄 — 짧은 라벨(없으면 label) */
  shortLabel?: string;
};

export const SEMO_BOX_SUBMENU: SemoBoxSubmenuItem[] = [
  /** 햄버거·데스크톱: label 유지 / 모바일 상단 고정줄만 */
  { to: '/skin-test', label: 'Find my Beauty box', shortLabel: 'Skin test' },
  { to: '/shop', label: 'Beauty box' },
  { to: '/inner-beauty', label: 'Fit box' },
  { to: '/hair-beauty', label: 'Hair box' },
  { to: '/promo', label: 'Promo' },
];

/** 현재 경로가 SEMO Box 하위 카탈로그/기능인지 (/shop/box-history 포함) */
export function isSemoBoxSubmenuPath(pathname: string): boolean {
  const path = (pathname.split('?')[0] ?? pathname).replace(/\/$/, '') || '/';
  return SEMO_BOX_SUBMENU.some((l) => path === l.to.replace(/\/$/, '') || path.startsWith(`${l.to}/`));
}
