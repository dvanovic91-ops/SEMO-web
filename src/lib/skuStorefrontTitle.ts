import { stripLegacyMockHeroClaimPrefix } from './skuMarketingDescriptions';

/** 목업·비속어 display_name — 스토어에서는 무시하고 name_en 등으로 대체 */
function isJunkSkuDisplayTitle(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  if (/^nihuya\b/i.test(t)) return true;
  if (/^니후야/u.test(t)) return true;
  return false;
}

function sanitizeDisplayName(display_name: string | null | undefined): string | null {
  const t = (display_name ?? '').trim();
  if (!t || isJunkSkuDisplayTitle(t)) return null;
  const s = stripLegacyMockHeroClaimPrefix(t).trim();
  if (!s || isJunkSkuDisplayTitle(s)) return null;
  return s;
}

function normSpaces(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 짧은 카피(display)와 긴 공식명(name_en)이 같은 제품을 가리킬 때 긴 쪽을 택함.
 * - 접두어 일치
 * - 또는 (의미 있는 길이일 때) 한 줄이 다른 줄에 부분 문자열로 포함
 */
export function mergeLatinSkuTitles(a: string, b: string): string {
  const x = a.trim();
  const y = b.trim();
  if (!y) return x;
  if (!x) return y;
  const xl = normSpaces(x);
  const yl = normSpaces(y);
  if (yl.startsWith(xl) && y.length > x.length) return y;
  if (xl.startsWith(yl) && x.length > y.length) return x;
  const worthSubstring =
    xl.length >= 8 || xl.split(/\s+/).filter(Boolean).length >= 2;
  if (worthSubstring && yl.includes(xl) && y.length > x.length) return y;
  if (worthSubstring && xl.includes(yl) && x.length > y.length) return x;
  return x.length >= y.length ? x : y;
}

function hasHangul(s: string): boolean {
  return /[가-힣]/.test(s);
}

/**
 * 세트 구성·구성품 상세 제목.
 * - ru/en 스토어: 라틴 후보(display_name, name_en, 라틴 fallback)를 병합해 짧은 표시명이 긴 공식명에 흡수되도록 함.
 * - language === 'ko' 일 때만 sku.name(한글) 우선.
 */
export function resolveSkuStorefrontName(opts: {
  display_name?: string | null;
  name_en?: string | null;
  name?: string | null;
  fallbackName?: string | null;
  /** 앱 언어(ru|en). 한글 상품명 우선은 'ko'일 때만 적용 */
  language?: string;
}): string {
  const language = (opts.language ?? '').trim();
  const d = sanitizeDisplayName(opts.display_name);
  const en = (opts.name_en ?? '').trim();
  const ko = (opts.name ?? '').trim();
  const fb = (opts.fallbackName ?? '').trim();

  if (language === 'ko' && ko && hasHangul(ko)) {
    return ko;
  }

  let bestLatin = '';
  for (const cand of [d, en, fb]) {
    if (!cand || hasHangul(cand)) continue;
    bestLatin = bestLatin ? mergeLatinSkuTitles(bestLatin, cand) : cand;
  }
  if (!bestLatin) bestLatin = (d || en || '').trim();
  if (!bestLatin && fb && !hasHangul(fb)) bestLatin = fb;

  if (bestLatin) return bestLatin;
  return ko || fb || '—';
}

/** 카드 한 줄 제목: 공백·하이픈·괄호 뒤 라틴/키릴 소문자만 대문자 (한글 등은 유지) */
export function formatStorefrontLineTitle(raw: string): string {
  if (!raw || raw === '—') return raw;
  const chars = [...raw];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const prev = i > 0 ? chars[i - 1] : undefined;
    if (i === 0 || (prev !== undefined && /[\s\-(/,]/.test(prev))) {
      if (/[a-zа-яё]/.test(c)) chars[i] = c.toUpperCase();
    }
  }
  return chars.join('');
}

/**
 * 박스 구성 카드: `브랜드 - 제품명` (제품명에 브랜드가 이미 앞에 있으면 중복 생략).
 */
export function formatCompositionDisplayTitle(
  brand: string | null | undefined,
  productLine: string | null | undefined,
): string {
  const p = (productLine ?? '').trim();
  const b = (brand ?? '').trim();
  if (!p && !b) return '';
  if (!b) return formatStorefrontLineTitle(p);
  const pl = p.toLowerCase();
  const bl = b.toLowerCase();
  if (pl === bl || pl.startsWith(`${bl} `) || pl.startsWith(`${bl}-`) || pl.startsWith(`${bl} —`) || pl.startsWith(`${bl} –`)) {
    return formatStorefrontLineTitle(p);
  }
  return `${formatStorefrontLineTitle(b)} - ${formatStorefrontLineTitle(p)}`;
}
