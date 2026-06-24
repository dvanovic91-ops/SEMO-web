/**
 * 스토어 구성품 상세 등 — sku_items.ingredients_json → 표시용 목록 (관리자 InventoryTab 로직과 동일 규칙).
 */
export type SkuIngredientLine = {
  name: string;
  name_lower: string;
  position: number;
  /** Python ingredient_fetcher가 SENSITIZING_INGREDIENTS 기준으로 표시한 주의 성분 여부 */
  is_sensitizing: boolean;
  /** Python INGREDIENT_BENEFIT_MAP 기준 효능 태그 목록 */
  benefit_tags: string[];
};

/**
 * 스토어 표시용: 공백·하이픈·괄호 등 “단어 시작”의 라틴/키릴 소문자만 대문자로 (나머지 문자열은 유지).
 * INCI 원문이 소문자여도 카드·목록에서 읽기 좋게 맞춤.
 */
export function formatInciNameForDisplay(name: string): string {
  if (!name) return name;
  const chars = [...name];
  const isWordStartSep = (ch: string | undefined) =>
    ch === undefined || /[\s\-(/]/.test(ch) || ch === ',';

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const prev = i > 0 ? chars[i - 1] : undefined;
    if (i === 0 || isWordStartSep(prev)) {
      if (/[a-zа-яё]/.test(c)) {
        chars[i] = c.toUpperCase();
      }
    }
  }
  return chars.join('');
}

export function parseSkuIngredientsJson(raw: unknown[] | null | undefined): SkuIngredientLine[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: SkuIngredientLine[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    if (!name.trim()) continue;
    const name_lower = typeof o.name_lower === 'string' ? o.name_lower : name.toLowerCase();
    const position = typeof o.position === 'number' ? o.position : out.length + 1;
    const is_sensitizing = o.is_sensitizing === true;
    const benefit_tags = Array.isArray(o.benefit_tags)
      ? (o.benefit_tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];
    out.push({ name, name_lower, position, is_sensitizing, benefit_tags });
  }
  return out;
}
