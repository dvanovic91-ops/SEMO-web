import { SITE_REGION } from './siteRegion';

/**
 * 지오라우팅(국가별 사이트 안내) 헬퍼.
 *
 * 데이터 현지화(152-FZ): 러시아/벨라루스 사용자는 `.ru`(얀덱스 백엔드)를 쓰고,
 * 그 외 국가는 `.com`(글로벌 백엔드)을 쓴다.
 *
 * 1차 라우팅은 DNS/CDN 엣지에서 처리하는 것이 원칙이고,
 * 이 파일은 잘못 들어온 사용자를 알맞은 도메인으로 안내하는 **클라이언트 안전망**이다.
 */
export const SEMO_DOMAINS = {
  global: 'https://semo-box.com',
  ru: 'https://semo-box.ru',
} as const;

/** `.ru`(러시아 현지 백엔드)를 사용해야 하는 국가 코드 */
export const RU_REGION_COUNTRIES = ['RU', 'BY'] as const;

const GEO_CACHE_KEY = 'semo_geo_cc';

export function getCachedCountry(): string | null {
  try {
    return sessionStorage.getItem(GEO_CACHE_KEY);
  } catch {
    return null;
  }
}

export function setCachedCountry(cc: string): void {
  try {
    sessionStorage.setItem(GEO_CACHE_KEY, cc);
  } catch {
    /* ignore */
  }
}

/** 방문자 국가 코드(ISO 2자리) 추정. sessionStorage 캐시 → IP 조회 순. 실패 시 null */
export async function detectVisitorCountry(signal?: AbortSignal): Promise<string | null> {
  const cached = getCachedCountry();
  if (cached) return cached;
  try {
    const res = await fetch('https://ipapi.co/json/', { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { country_code?: string };
    const cc = (data?.country_code ?? '').toUpperCase();
    if (cc) {
      setCachedCountry(cc);
      return cc;
    }
  } catch {
    /* network/abort ignore */
  }
  return null;
}

/** 실제 운영 도메인(semo-box.com / semo-box.ru)에서만 안내를 띄운다 (localhost·프리뷰 제외) */
export function isOnSemoProdHost(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'semo-box.com' || h.endsWith('.semo-box.com') || h === 'semo-box.ru' || h.endsWith('.semo-box.ru');
}

/**
 * 방문자가 "다른 리전 사이트"를 써야 한다면 이동할 URL을 반환, 아니면 null.
 * - 글로벌(.com)에 있는데 RU/BY 사용자 → .ru
 * - .ru에 있는데 RU/BY 가 아닌 사용자 → .com
 */
export function crossRegionTarget(country: string | null): string | null {
  if (!country) return null;
  const isRuRegionUser = (RU_REGION_COUNTRIES as readonly string[]).includes(country);
  if (SITE_REGION === 'global' && isRuRegionUser) return SEMO_DOMAINS.ru;
  if (SITE_REGION === 'ru' && !isRuRegionUser) return SEMO_DOMAINS.global;
  return null;
}
