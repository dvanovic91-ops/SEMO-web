export const KOSKOS_ADMIN_PATH = '/koskos/mgr-8fq3wz';

export const CATEGORY_OPTIONS = [
  { value: 'cleanser', label: '클렌저' },
  { value: 'toner', label: '토너' },
  { value: 'essence_serum', label: '에센스/세럼' },
  { value: 'cream_moisturizer', label: '크림/수분크림' },
  { value: 'sun_care', label: '선케어' },
  { value: 'mask_pack', label: '마스크팩' },
  { value: 'mist_spray', label: '미스트' },
  { value: 'hair_care', label: '헤어/바디' },
  { value: 'other', label: '기타' },
] as const;

export type PendingMatchedItem = {
  raw?: string | null;
  matched?: boolean | null;
  name_en?: string | null;
  name_kr?: string | null;
  inci_key?: string | null;
};

export type PendingRow = {
  id: string;
  photo_url: string | null;
  ingredient_photo_url: string | null;
  photo_urls: string[] | null;
  extracted_name: string | null;
  extracted_brand: string | null;
  extracted_name_translation: string | null;
  extracted_ingredients_raw: string | null;
  extracted_category: string | null;
  status: string;
  created_at: string;
  matched_ingredients: PendingMatchedItem[] | null;
  unlisted_ingredient_proposals: unknown[] | null;
  ingredients_source: string | null;
  web_search_source_url: string | null;
  web_search_source_description: string | null;
  submission_type: string | null;
  description: string | null;
  target_product_id: string | null;
  brand_known: boolean;
};

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return '미분류';
  return CATEGORY_OPTIONS.find((c) => c.value === key)?.label ?? key;
}

export function collectPhotos(row: PendingRow): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [row.photo_url, row.ingredient_photo_url, ...(row.photo_urls ?? [])]) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function matchStats(row: PendingRow): { matched: number; unmatched: number; unlisted: number } {
  const items = row.matched_ingredients ?? [];
  const matched = items.filter((i) => i.matched === true).length;
  const unmatched = items.filter((i) => i.matched !== true).length;
  return {
    matched,
    unmatched,
    unlisted: row.unlisted_ingredient_proposals?.length ?? 0,
  };
}
