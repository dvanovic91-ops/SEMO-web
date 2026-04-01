import type { SupabaseClient } from '@supabase/supabase-js';

/** ingredient_library 행 (Supabase jsonb → 클라이언트) */
export type IngredientLibraryRow = {
  inci_key: string;
  name_en: string | null;
  benefit_tags: string[];
  avoid_skin_types: string[];
  /** Gemini 5축 0–10 (D,O,S,P,W) */
  axis_scores: Record<string, number> | null;
  /** 관리자 토글: 순서 가중 보정(저농도 유효 액티브) */
  tier_active: boolean;
  synergy_with: string[];
  conflict_with: string[];
  concentration_note: string | null;
  description_ko: string | null;
  description_en: string | null;
  description_ru: string | null;
  source: string | null;
};

export function normalizeInciKey(name: string, nameLower?: string): string {
  return (nameLower ?? name).trim().toLowerCase().replace(/\s+/g, ' ');
}

/** 괄호 수식어 제거 key: "niacinamide (vitamin b3)" → "niacinamide" */
function bareInciKey(key: string): string {
  return key.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** ingredients_json 한 줄 → ingredient_library 행 (정규키·bare 키 모두 시도) */
export function lookupIngredientLibraryRow(
  map: Map<string, IngredientLibraryRow>,
  name: string,
  nameLower: string,
): IngredientLibraryRow | undefined {
  const k = normalizeInciKey(name, nameLower);
  return map.get(k) ?? map.get(bareInciKey(k));
}

/** Gemini 라이브러리 5축 (0–10) — ingredients_json 한 줄에 채울 때 사용 */
const LIB_AXIS_KEYS = ['D', 'O', 'S', 'P', 'W'] as const;

function lineHasLibraryAxisScores(axisScores: unknown): boolean {
  if (!axisScores || typeof axisScores !== 'object' || Array.isArray(axisScores)) return false;
  const o = axisScores as Record<string, unknown>;
  for (const k of LIB_AXIS_KEYS) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return true;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return true;
    }
  }
  return false;
}

/** Python `ingredient_axis_library_merge.infer_dospw_axis_scores_from_line` 와 동일 테이블 */
const TAG_AXIS_INFER_DOSPW: Record<string, Partial<Record<(typeof LIB_AXIS_KEYS)[number], number>>> = {
  hydrating: { D: 8, O: 2 },
  oil_control: { D: 2, O: 8 },
  soothing: { S: 8 },
  barrier: { S: 5, D: 4 },
  brightening: { P: 8 },
  anti_aging: { W: 8 },
  exfoliating: { O: 6, P: 5 },
  antioxidant: { P: 6, W: 6 },
  firming: { W: 7 },
  acne: { O: 7 },
  sensitizing: { S: 3, O: 4 },
  uv_protection: { P: 7 },
};

/**
 * 기획 탭 「축값」커버리지용: 저장된 axis_scores 가 없어도 benefit_tags(및 is_sensitizing)로
 * D~W 추정이 되면 true — 서버 `infer_dospw_axis_scores_from_line` 과 동일 테이블.
 */
export function lineHasEffectiveDospwAxisSignalForCoverage(ing: Record<string, unknown>): boolean {
  if (lineHasLibraryAxisScores(ing.axis_scores)) return true;
  return inferDospwAxisScoresFromLine(ing) !== null;
}

function inferDospwAxisScoresFromLine(o: Record<string, unknown>): Record<string, number> | null {
  const acc: Record<(typeof LIB_AXIS_KEYS)[number], number> = { D: 0, O: 0, S: 0, P: 0, W: 0 };
  let hit = false;
  const tags = o.benefit_tags;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (typeof t !== 'string') continue;
      const prof = TAG_AXIS_INFER_DOSPW[t.trim()];
      if (!prof) continue;
      hit = true;
      for (const k of LIB_AXIS_KEYS) {
        const v = prof[k];
        if (typeof v === 'number') acc[k] = Math.max(acc[k], v);
      }
    }
  }
  if (o.is_sensitizing === true) {
    hit = true;
    acc.S = Math.max(acc.S, 2);
    acc.O = Math.max(acc.O, 3);
  }
  if (!hit) return null;
  const out: Record<string, number> = {};
  for (const k of LIB_AXIS_KEYS) {
    if (acc[k] > 0) out[k] = Math.max(0, Math.min(10, Math.round(acc[k])));
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * ingredient_library의 axis_scores를 우선 병합하고, 없으면 benefit_tags로 D~W 보조 추정.
 * 이미 D/O/S/P/W 중 하나라도 숫자가 있으면 해당 줄은 건드리지 않습니다.
 */
export function mergeAxisScoresFromLibraryIntoIngredientsJson(
  ingredientsJson: unknown[],
  libMap: Map<string, IngredientLibraryRow>,
): { merged: unknown[]; linesFilled: number; tierTouched: number } {
  let linesFilled = 0;
  let tierTouched = 0;
  const merged = ingredientsJson.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    if (!name.trim()) return item;
    const nameLower = typeof o.name_lower === 'string' ? o.name_lower : name.toLowerCase();
    const lib = lookupIngredientLibraryRow(libMap, name, nameLower);
    let next: Record<string, unknown> = { ...o };
    let changed = false;
    if (lib) {
      const libTier = Boolean(lib.tier_active);
      if (Boolean(o.tier_active) !== libTier) {
        next.tier_active = libTier;
        changed = true;
        tierTouched += 1;
      }
    }
    if (lineHasLibraryAxisScores(next.axis_scores)) {
      return changed ? next : item;
    }
    const ax = lib?.axis_scores;
    if (ax && Object.keys(ax).length > 0) {
      linesFilled += 1;
      return { ...next, axis_scores: { ...ax } };
    }
    const inferred = inferDospwAxisScoresFromLine(next);
    if (inferred) {
      linesFilled += 1;
      return { ...next, axis_scores: inferred };
    }
    return changed ? next : item;
  });
  return { merged, linesFilled, tierTouched };
}

/** 저장 직전: 라이브러리에서 조회해 병합. 변경이 없으면 null */
export async function applyAxisScoresFromLibraryToIngredientsJson(
  client: SupabaseClient,
  ingredientsJson: unknown[],
): Promise<unknown[] | null> {
  const keys = ingredientsJson
    .map((x) => {
      if (!x || typeof x !== 'object') return '';
      const o = x as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name : '';
      if (!name.trim()) return '';
      const nl = typeof o.name_lower === 'string' ? o.name_lower : name.toLowerCase();
      return normalizeInciKey(name, nl);
    })
    .filter((k) => k.length > 0);
  if (keys.length === 0) return null;
  const libMap = await fetchIngredientLibraryMap(client, keys);
  const { merged, linesFilled, tierTouched } = mergeAxisScoresFromLibraryIntoIngredientsJson(ingredientsJson, libMap);
  if (linesFilled === 0 && tierTouched === 0) return null;
  return merged;
}

function parseBenefitTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string');
}

function parseAxisScores(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const k of ['D', 'O', 'S', 'P', 'W']) {
    const v = o[k];
    let n: number | null = null;
    if (typeof v === 'number' && !Number.isNaN(v)) n = v;
    else if (typeof v === 'string' && v.trim() !== '') {
      const x = Number(v);
      if (!Number.isNaN(x)) n = x;
    }
    if (n !== null) out[k] = Math.max(0, Math.min(10, n));
  }
  return Object.keys(out).length > 0 ? out : null;
}

function parseTextArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim().toLowerCase());
}

function rowFromDb(r: Record<string, unknown>): IngredientLibraryRow {
  return {
    inci_key: String(r.inci_key ?? ''),
    name_en: typeof r.name_en === 'string' ? r.name_en : null,
    benefit_tags: parseBenefitTags(r.benefit_tags),
    avoid_skin_types: parseBenefitTags(r.avoid_skin_types),
    axis_scores: parseAxisScores(r.axis_scores),
    tier_active: r.tier_active === true,
    synergy_with: parseTextArray(r.synergy_with),
    conflict_with: parseTextArray(r.conflict_with),
    concentration_note: typeof r.concentration_note === 'string' ? r.concentration_note : null,
    description_ko: typeof r.description_ko === 'string' ? r.description_ko : null,
    description_en: typeof r.description_en === 'string' ? r.description_en : null,
    description_ru: typeof r.description_ru === 'string' ? r.description_ru : null,
    source: typeof r.source === 'string' ? r.source : null,
  };
}

/** sku_items.ingredients_json 배열을 읽어 라이브러리에 upsert (제품마다 같은 성분 재검색 감소) */
export async function upsertIngredientLibraryFromJson(
  client: SupabaseClient,
  rawJson: unknown,
): Promise<{ upserted: number; error?: string }> {
  if (!Array.isArray(rawJson) || rawJson.length === 0) return { upserted: 0 };

  const byKey = new Map<
    string,
    { inci_key: string; name_en: string; benefit_tags: string[]; source: string }
  >();

  for (const x of rawJson) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name : '';
    if (!name.trim()) continue;
    const name_lower = typeof o.name_lower === 'string' ? o.name_lower : name.toLowerCase();
    const key = normalizeInciKey(name, name_lower);
    if (!key) continue;
    const tags = parseBenefitTags(o.benefit_tags);
    const prev = byKey.get(key);
    if (!prev || tags.length > prev.benefit_tags.length) {
      byKey.set(key, { inci_key: key, name_en: name, benefit_tags: tags, source: 'sku_sync' });
    }
  }

  const rows = [...byKey.values()];
  if (rows.length === 0) return { upserted: 0 };

  const keys = rows.map((r) => r.inci_key);
  const existingMap = new Map<string, IngredientLibraryRow>();
  const loadChunk = 120;
  for (let i = 0; i < keys.length; i += loadChunk) {
    const slice = keys.slice(i, i + loadChunk);
    const { data } = await client.from('ingredient_library').select('*').in('inci_key', slice);
    for (const raw of data ?? []) {
      const row = rowFromDb(raw as Record<string, unknown>);
      if (row.inci_key) existingMap.set(row.inci_key, row);
    }
  }

  const chunkSize = 150;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r) => {
      const ex = existingMap.get(r.inci_key);
      const tags = [...new Set([...(ex?.benefit_tags ?? []), ...r.benefit_tags])];
      return {
        inci_key: r.inci_key,
        name_en: r.name_en || ex?.name_en || null,
        benefit_tags: tags,
        source: r.source,
        description_ko: ex?.description_ko?.trim() ? ex.description_ko : null,
        description_en: ex?.description_en?.trim() ? ex.description_en : null,
        description_ru: ex?.description_ru?.trim() ? ex.description_ru : null,
        avoid_skin_types: ex?.avoid_skin_types ?? [],
        axis_scores:
          ex?.axis_scores && Object.keys(ex.axis_scores).length > 0 ? ex.axis_scores : {},
        tier_active: ex?.tier_active === true,
        synergy_with: ex?.synergy_with ?? [],
        conflict_with: ex?.conflict_with ?? [],
        concentration_note: ex?.concentration_note ?? null,
      };
    });
    const { error } = await client.from('ingredient_library').upsert(chunk, { onConflict: 'inci_key' });
    if (error) return { upserted: i, error: error.message };
  }

  return { upserted: rows.length };
}

export async function upsertIngredientLibraryFromSkuId(
  client: SupabaseClient,
  skuId: string,
): Promise<{ upserted: number; error?: string }> {
  const { data, error } = await client.from('sku_items').select('ingredients_json').eq('id', skuId).maybeSingle();
  if (error) return { upserted: 0, error: error.message };
  return upsertIngredientLibraryFromJson(client, data?.ingredients_json);
}

export async function fetchIngredientLibraryMap(
  client: SupabaseClient,
  keys: string[],
): Promise<Map<string, IngredientLibraryRow>> {
  const map = new Map<string, IngredientLibraryRow>();
  const fullKeys = keys.map((k) => k.trim().toLowerCase()).filter(Boolean);
  // 괄호 수식어 제거 key도 함께 조회 ("niacinamide (비타민b3)" → "niacinamide")
  const bareKeys = fullKeys.map(bareInciKey).filter((b) => b.length > 0);
  const norm = [...new Set([...fullKeys, ...bareKeys])];
  if (norm.length === 0) return map;

  const chunkSize = 100;
  for (let i = 0; i < norm.length; i += chunkSize) {
    const slice = norm.slice(i, i + chunkSize);
    const { data, error } = await client.from('ingredient_library').select('*').in('inci_key', slice);
    if (error) continue;
    for (const raw of data ?? []) {
      const row = rowFromDb(raw as Record<string, unknown>);
      if (row.inci_key) map.set(row.inci_key, row);
    }
  }
  // 원본 full key로도 조회 가능하게 bare key → full key aliasing
  for (const fk of fullKeys) {
    if (!map.has(fk)) {
      const bk = bareInciKey(fk);
      const existing = map.get(bk);
      if (existing) map.set(fk, existing);
    }
  }
  return map;
}
