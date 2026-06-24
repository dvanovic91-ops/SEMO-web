/** Director Pi curation per SKU (NotebookLM 69개 표) */
export type PiProfile = {
  video_says_for?: string[];
  avoid_for?: string[];
  texture_feel?: string;
  why_ko?: string;
  /** 파i tier: top_of_top_2025 | past_top | a_grade | universal 등 */
  tier?: string;
  key_ingredients?: string[];
  product_name_ko?: string;
  /** 비교표 stronger_for (있을 때) */
  stronger_for_ko?: string;
  /** 프리미엄 특징 칩 (KO) */
  feature_tags_ko?: string[];
  /** 사용자 추가 범용 SKU */
  curation_source?: 'universal' | 'pi';
  /** 재수집 후 baumann 복원용 (seed/수동 확정) */
  baumann_types?: string[];
  /** 제품 특화 뱃지 — locale별 2개 */
  badges?: { en: string[]; ru: string[] };
  /** 마케팅 배지 — 박스 빌더 카드 표시용 */
  marketing_badge?: 'youtuber_pick' | 'retail_top' | null;
};

export function parseCommaList(raw: string): string[] {
  return raw
    .split(/[,;，、\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatCommaList(items: string[] | null | undefined): string {
  return (items ?? []).join(', ');
}

export function buildPiProfileFromDraft(draft: {
  video_says_for_text: string;
  avoid_for_text: string;
  texture_feel: string;
  why_ko: string;
  tier?: string;
  key_ingredients_text?: string;
}): PiProfile | null {
  const video_says_for = parseCommaList(draft.video_says_for_text);
  const avoid_for = parseCommaList(draft.avoid_for_text);
  const texture_feel = draft.texture_feel.trim();
  const why_ko = draft.why_ko.trim();
  const tier = draft.tier?.trim();
  const key_ingredients = draft.key_ingredients_text
    ? parseCommaList(draft.key_ingredients_text)
    : [];
  if (
    !video_says_for.length &&
    !avoid_for.length &&
    !texture_feel &&
    !why_ko &&
    !tier &&
    !key_ingredients.length
  ) {
    return null;
  }
  return {
    ...(video_says_for.length ? { video_says_for } : {}),
    ...(avoid_for.length ? { avoid_for } : {}),
    ...(texture_feel ? { texture_feel } : {}),
    ...(why_ko ? { why_ko } : {}),
    ...(tier ? { tier } : {}),
    ...(key_ingredients.length ? { key_ingredients } : {}),
  };
}

/** S(민감) 유저 + pi avoid에 '민감' → 👑 후보 제외 */
export function userBlockedByPiAvoid(userType: string, piProfile: PiProfile | null | undefined): boolean {
  if (!userType || userType.length !== 4 || userType[1] !== 'S') return false;
  if (!piProfile?.avoid_for?.length) return false;
  const text = piProfile.avoid_for.join(' ').toLowerCase();
  return text.includes('민감');
}
