/**
 * sku_items.key_ingredients_desc 의 __claim__(소구포인트) + 히어로 성분 줄을
 * 상세·구성품 카드용 description_ko/en/ru 로 합칩니다.
 * DB description_* 에 히어만 있고 클레임이 빠진 예전 행도 claim 텍스트를 앞에 붙입니다.
 */

/** 병합/표시용: ✨ 히어로 성분 줄 제거 (구성품 카드·소개 블록 등). */
export function stripHeroBulletLines(text: string): string {
  return text
    .split('\n')
    .filter((line) => !line.trim().startsWith('✨'))
    .join('\n')
    .trim();
}

/** 예전 목업 제품명이 소구문 앞에 붙은 행 (DB·표시 공통 정리). */
export function stripLegacyMockHeroClaimPrefix(text: string): string {
  const t = (text ?? '').trim();
  if (!t) return t;
  return t
    .replace(/^니후야[^:]*:\s*/u, '')
    .replace(/^Nihuya[^:]*:\s*/iu, '')
    .trim();
}

export type SkuHeroDescRow = { name: string; ko: string; en: string; ru: string };

export type SkuForMarketingDesc = {
  description?: string | null;
  description_en?: string | null;
  description_ru?: string | null;
  key_ingredients_desc?: SkuHeroDescRow[] | null;
} | null;

/** DB에 json 객체로 들어간 경우 등 — .find/.filter 호출 전 배열로 정규화 */
function heroRowsFromSku(sku: SkuForMarketingDesc): SkuHeroDescRow[] {
  const raw = sku?.key_ingredients_desc;
  return Array.isArray(raw) ? raw : [];
}

function joinClaimAndBody(claim: string, body: string): string | null {
  const c = claim.trim();
  const b = body.trim();
  if (c && b) return `${c}\n\n${b}`;
  return c || b || null;
}

/** SKU 행만 넣고, 구성품 행 fallback 은 호출 측에서 ?? 로 처리 */
export function mergeSkuLocalizedDescriptions(sku: SkuForMarketingDesc): {
  ko: string | null;
  en: string | null;
  ru: string | null;
} {
  const heroes = heroRowsFromSku(sku);
  const rawClaim = heroes.find((h) => h.name === '__claim__');
  const claimRow = rawClaim
    ? {
        ...rawClaim,
        ko: stripLegacyMockHeroClaimPrefix(rawClaim.ko),
        en: stripLegacyMockHeroClaimPrefix(rawClaim.en),
        ru: stripLegacyMockHeroClaimPrefix(rawClaim.ru),
      }
    : undefined;
  const heroOnly = heroes.filter((h) => h.name !== '__claim__');
  const blockKo = heroOnly.length ? heroOnly.map((h) => `✨ ${h.name} — ${h.ko}`).join('\n') : '';
  const blockEn = heroOnly.length ? heroOnly.map((h) => `✨ ${h.name} — ${h.en}`).join('\n') : '';
  const blockRu = heroOnly.length ? heroOnly.map((h) => `✨ ${h.name} — ${h.ru}`).join('\n') : '';

  const fullFromKeyKo = joinClaimAndBody(claimRow?.ko ?? '', blockKo);
  const fullFromKeyEn = joinClaimAndBody(claimRow?.en ?? '', blockEn);
  const fullFromKeyRu = joinClaimAndBody(claimRow?.ru ?? '', blockRu);

  const mergeDesc = (
    skuVal: string | null | undefined,
    assembled: string | null,
    lang: 'ko' | 'en' | 'ru',
  ): string | null => {
    const c = (claimRow?.[lang] ?? '').trim();
    const raw = (skuVal ?? '').trim() || null;
    if (!c) return raw ?? assembled;
    if (!raw) return assembled;
    if (raw.includes(c)) return raw;
    return `${c}\n\n${raw}`;
  };

  return {
    ko: mergeDesc(sku?.description, fullFromKeyKo, 'ko'),
    en: mergeDesc(sku?.description_en, fullFromKeyEn, 'en'),
    ru: mergeDesc(sku?.description_ru, fullFromKeyRu, 'ru'),
  };
}

function compositionPartsForLang(
  sku: SkuForMarketingDesc,
  lang: 'ko' | 'en' | 'ru',
): { claim: string | null; body: string | null } {
  const heroes = heroRowsFromSku(sku);
  const rawClaim = heroes.find((h) => h.name === '__claim__');
  const claimRow = rawClaim
    ? {
        ...rawClaim,
        ko: stripLegacyMockHeroClaimPrefix(rawClaim.ko),
        en: stripLegacyMockHeroClaimPrefix(rawClaim.en),
        ru: stripLegacyMockHeroClaimPrefix(rawClaim.ru),
      }
    : undefined;

  const field = lang === 'ko' ? 'description' : lang === 'en' ? 'description_en' : 'description_ru';
  const rawField = (sku?.[field] as string | null | undefined) ?? '';
  const bodyRaw = stripHeroBulletLines(stripLegacyMockHeroClaimPrefix(rawField)).trim();
  const body = bodyRaw || null;
  let claim = (claimRow?.[lang] ?? '').trim() || null;

  if (claim && body && body.includes(claim)) {
    claim = null;
  }

  return { claim, body };
}

/**
 * «Состав набора»: __claim__(핵심 한 줄)과 본문 description_* 분리 — UI에서 클레임 강조용.
 */
export function getSkuCompositionDisplayParts(sku: SkuForMarketingDesc): {
  ko: { claim: string | null; body: string | null };
  en: { claim: string | null; body: string | null };
  ru: { claim: string | null; body: string | null };
} {
  return {
    ko: compositionPartsForLang(sku, 'ko'),
    en: compositionPartsForLang(sku, 'en'),
    ru: compositionPartsForLang(sku, 'ru'),
  };
}

/**
 * «Состав набора» 단일 문자열 (히어로 ✨ 없음). 토스트·미리보기 등 레거시용.
 */
export function mergeSkuProductCompositionCopy(sku: SkuForMarketingDesc): {
  ko: string | null;
  en: string | null;
  ru: string | null;
} {
  const p = getSkuCompositionDisplayParts(sku);
  const join = (x: { claim: string | null; body: string | null }) => {
    if (x.claim && x.body) return `${x.claim}\n\n${x.body}`;
    return x.claim || x.body || null;
  };
  return { ko: join(p.ko), en: join(p.en), ru: join(p.ru) };
}
