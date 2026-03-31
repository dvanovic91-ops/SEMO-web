export type IngredientStrength = 1 | 2 | 3;

export type ProductIngredientEntry = {
  component_name: string;
  ingredient_name: string;
  role_ru: string;
  strength: IngredientStrength;
};

export type ProductIngredientBrief = {
  story_title_ru: string;
  story_body_ru: string;
  infographic_image_url?: string;
  entries: ProductIngredientEntry[];
};

export type ProductIngredientBriefMap = Record<string, ProductIngredientBrief>;

export function clampStrength(raw: number): IngredientStrength {
  if (raw >= 3) return 3;
  if (raw <= 1) return 1;
  return 2;
}

export function parseIngredientLines(text: string): ProductIngredientEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [component, ingredient, role, strengthRaw] = line.split('|').map((x) => x.trim());
      const strength = clampStrength(Number(strengthRaw || 2));
      return {
        component_name: component || '',
        ingredient_name: ingredient || '',
        role_ru: role || '',
        strength,
      } as ProductIngredientEntry;
    })
    .filter((x) => x.component_name && x.ingredient_name && x.role_ru);
}

export function formatIngredientLines(entries: ProductIngredientEntry[]): string {
  return entries.map((x) => `${x.component_name} | ${x.ingredient_name} | ${x.role_ru} | ${x.strength}`).join('\n');
}

/** site_settings.product_ingredient_briefs 없을 때 — 더미 카피 없음 */
export function createEmptyIngredientBrief(): ProductIngredientBrief {
  return {
    story_title_ru: '',
    story_body_ru: '',
    infographic_image_url: undefined,
    entries: [],
  };
}

export function normalizeBrief(raw: unknown): ProductIngredientBrief {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const entriesRaw = Array.isArray(obj.entries) ? obj.entries : [];
  const entries: ProductIngredientEntry[] = entriesRaw
    .map((it) => {
      const o = it as Record<string, unknown>;
      return {
        component_name: String(o.component_name ?? '').trim(),
        ingredient_name: String(o.ingredient_name ?? '').trim(),
        role_ru: String(o.role_ru ?? '').trim(),
        strength: clampStrength(Number(o.strength ?? 2)),
      } as ProductIngredientEntry;
    })
    .filter((x) => x.component_name && x.ingredient_name && x.role_ru);
  return {
    story_title_ru: String(obj.story_title_ru ?? '').trim(),
    story_body_ru: String(obj.story_body_ru ?? '').trim(),
    infographic_image_url: String(obj.infographic_image_url ?? '').trim() || undefined,
    entries,
  };
}

/** @deprecated 과거 클라이언트 더미 — 항상 빈 브리프 반환. 실제 카피는 site_settings.product_ingredient_briefs */
export function mockBriefFromComponents(_productName: string, _componentNames: string[]): ProductIngredientBrief {
  return createEmptyIngredientBrief();
}
