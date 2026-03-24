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

export function mockBriefFromComponents(productName: string, componentNames: string[]): ProductIngredientBrief {
  const picked = componentNames.slice(0, 4);
  const entries = picked.flatMap((name, idx) => {
    const samples = [
      { ingredient: 'Ниацинамид', role: 'Выравнивает тон и поддерживает барьер кожи', strength: 3 },
      { ingredient: 'Пантенол', role: 'Снижает чувствительность и успокаивает кожу', strength: 2 },
      { ingredient: 'Гиалуроновая кислота', role: 'Удерживает влагу и уменьшает стянутость', strength: 3 },
      { ingredient: 'Церамиды', role: 'Укрепляют защитный слой и уменьшают сухость', strength: 2 },
    ] as const;
    const pick = samples[idx % samples.length];
    return [
      {
        component_name: name,
        ingredient_name: pick.ingredient,
        role_ru: pick.role,
        strength: pick.strength,
      } as ProductIngredientEntry,
    ];
  });
  return {
    story_title_ru: 'Почему этот набор вам подходит',
    story_body_ru: `${productName} сочетает увлажнение, восстановление барьера и мягкое выравнивание тона в одном курсе ухода.`,
    infographic_image_url: undefined,
    entries,
  };
}
