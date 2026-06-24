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
 * 스토어front 제품명 (.com 영어 · .ru 러시아 UI — 제품명·브랜드는 영문 INCI/라틴 유지).
 *
 * `display_name`(한글)은 **관리자 제품관리 탭 전용** — 스토어에서는 절대 사용하지 않음.
 */
export function resolveSkuStorefrontName(opts: {
  /** @deprecated 스토어front에서 무시 — InventoryTab 등 관리자 UI 전용 */
  display_name?: string | null;
  name_en?: string | null;
  name?: string | null;
  fallbackName?: string | null;
  language?: string;
}): string {
  const en = (opts.name_en ?? '').trim();
  const skuName = (opts.name ?? '').trim();
  const fb = (opts.fallbackName ?? '').trim();

  let bestLatin = '';
  for (const cand of [en, skuName, fb]) {
    if (!cand || hasHangul(cand)) continue;
    bestLatin = bestLatin ? mergeLatinSkuTitles(bestLatin, cand) : cand;
  }
  if (!bestLatin && en) bestLatin = en;
  if (!bestLatin && skuName && !hasHangul(skuName)) bestLatin = skuName;
  if (!bestLatin && fb && !hasHangul(fb)) bestLatin = fb;

  return bestLatin || '—';
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

/** 관리자 InventoryTab 등 — 한글 display_name 표시용 (스토어 API 금지) */
export function resolveAdminSkuDisplayLabel(opts: {
  display_name?: string | null;
  name?: string | null;
  name_en?: string | null;
}): string {
  const d = sanitizeDisplayName(opts.display_name);
  if (d) return d;
  const ko = (opts.name ?? '').trim();
  if (ko && hasHangul(ko)) return ko;
  return (opts.name_en ?? opts.name ?? '').trim() || '—';
}
