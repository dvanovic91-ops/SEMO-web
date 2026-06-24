/** 임시 — Navbar 왼쪽 로고 크기·위치 튜닝 (localStorage, 나중에 탭 제거 가능) */

export type NavLogoTune = {
  /** <640px 높이 (rem) */
  hMobileRem: number;
  /** sm+ 높이 (rem) */
  hSmRem: number;
  /** md+ 높이 (rem) */
  hMdRem: number;
  /** 모바일 max-width (rem) */
  maxWMobileRem: number;
  /** 모바일 max-width (vw) */
  maxWMobileVw: number;
  /** md+ max-width (rem) */
  maxWMdRem: number;
  /** 왼쪽 여백 보정 (rem, 음수 가능) */
  offsetXRem: number;
};

export const NAV_LOGO_TUNE_STORAGE_KEY = 'semo_nav_logo_tune_v1';
export const NAV_LOGO_TUNE_STYLE_ID = 'semo-nav-logo-tune-styles';
export const NAV_LOGO_TUNE_EVENT = 'semo-nav-logo-tune-changed';

export const NAV_LOGO_TUNE_DEFAULTS: NavLogoTune = {
  hMobileRem: 1.55,
  hSmRem: 2,
  hMdRem: 2.25,
  maxWMobileRem: 12.5,
  maxWMobileVw: 58,
  maxWMdRem: 14,
  offsetXRem: 0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function normalizeNavLogoTune(raw: Partial<NavLogoTune> | null | undefined): NavLogoTune {
  const d = NAV_LOGO_TUNE_DEFAULTS;
  const r = raw ?? {};
  return {
    hMobileRem: clamp(Number(r.hMobileRem ?? d.hMobileRem), 0.8, 4),
    hSmRem: clamp(Number(r.hSmRem ?? d.hSmRem), 0.8, 4.5),
    hMdRem: clamp(Number(r.hMdRem ?? d.hMdRem), 0.8, 5),
    maxWMobileRem: clamp(Number(r.maxWMobileRem ?? d.maxWMobileRem), 6, 22),
    maxWMobileVw: clamp(Number(r.maxWMobileVw ?? d.maxWMobileVw), 30, 90),
    maxWMdRem: clamp(Number(r.maxWMdRem ?? d.maxWMdRem), 8, 24),
    offsetXRem: clamp(Number(r.offsetXRem ?? d.offsetXRem), -2, 3),
  };
}

export function loadNavLogoTune(): NavLogoTune {
  try {
    const raw = localStorage.getItem(NAV_LOGO_TUNE_STORAGE_KEY);
    if (!raw) return { ...NAV_LOGO_TUNE_DEFAULTS };
    return normalizeNavLogoTune(JSON.parse(raw) as Partial<NavLogoTune>);
  } catch {
    return { ...NAV_LOGO_TUNE_DEFAULTS };
  }
}

export function previewNavLogoTune(tune: NavLogoTune): NavLogoTune {
  const normalized = normalizeNavLogoTune(tune);
  applyNavLogoTuneStyles(normalized);
  return normalized;
}

export function revertNavLogoTuneToSaved(): NavLogoTune {
  const saved = loadNavLogoTune();
  applyNavLogoTuneStyles(saved);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NAV_LOGO_TUNE_EVENT, { detail: saved }));
  }
  return saved;
}

export function navLogoTuneEquals(a: NavLogoTune, b: NavLogoTune): boolean {
  return JSON.stringify(normalizeNavLogoTune(a)) === JSON.stringify(normalizeNavLogoTune(b));
}

export function saveNavLogoTune(tune: NavLogoTune): NavLogoTune {
  const normalized = normalizeNavLogoTune(tune);
  try {
    localStorage.setItem(NAV_LOGO_TUNE_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* private mode */
  }
  applyNavLogoTuneStyles(normalized);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NAV_LOGO_TUNE_EVENT, { detail: normalized }));
  }
  return normalized;
}

export function resetNavLogoTune(): NavLogoTune {
  try {
    localStorage.removeItem(NAV_LOGO_TUNE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return saveNavLogoTune({ ...NAV_LOGO_TUNE_DEFAULTS });
}

/** SemoBoxLogo img 에 붙는 클래스 */
export const NAV_LOGO_IMG_CLASS = 'semo-nav-logo-img';

export function applyNavLogoTuneStyles(tune: NavLogoTune = loadNavLogoTune()): void {
  if (typeof document === 'undefined') return;
  const t = normalizeNavLogoTune(tune);
  let el = document.getElementById(NAV_LOGO_TUNE_STYLE_ID);
  if (!el) {
    el = document.createElement('style');
    el.id = NAV_LOGO_TUNE_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
.${NAV_LOGO_IMG_CLASS} {
  height: ${t.hMobileRem}rem;
  max-width: min(${t.maxWMobileRem}rem, ${t.maxWMobileVw}vw);
  margin-left: ${t.offsetXRem}rem;
}
@media (min-width: 640px) {
  .${NAV_LOGO_IMG_CLASS} {
    height: ${t.hSmRem}rem;
  }
}
@media (min-width: 768px) {
  .${NAV_LOGO_IMG_CLASS} {
    height: ${t.hMdRem}rem;
    max-width: ${t.maxWMdRem}rem;
  }
}
`.trim();
}
