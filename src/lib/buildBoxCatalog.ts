import type { SupabaseClient } from '@supabase/supabase-js';
import { applySunscreenTagFromInci } from './boxBuilderTagDisplay';
import type { PiProfile } from './piProfile';

export type BoxSlotKey =
  | 'cleanser'
  | 'toner'
  | 'serum'
  | 'ampoule'
  | 'cream'
  | 'sunscreen'
  | 'premium';

export const BOX_SLOT_ORDER: BoxSlotKey[] = [
  'cleanser',
  'toner',
  'serum',
  'ampoule',
  'cream',
  'sunscreen',
];

export const BOX_BUILDER_ADMIN_SLOTS: BoxSlotKey[] = [...BOX_SLOT_ORDER, 'premium'];

export const BOX_SLOT_LABELS: Record<BoxSlotKey, { ru: string; en: string }> = {
  cleanser: { ru: 'Клинсер', en: 'Cleanser' },
  toner: { ru: 'Тонер', en: 'Toner' },
  serum: { ru: 'Сыворотка', en: 'Serum' },
  ampoule: { ru: 'Ампула', en: 'Ampoule' },
  cream: { ru: 'Крем', en: 'Cream' },
  sunscreen: { ru: 'Санскрин', en: 'Sunscreen' },
  premium: { ru: 'Премиум', en: 'Premium' },
};

export type BuildProduct = {
  id: string;
  brand: string;
  nameRu: string;
  nameEn: string;
  tagRu: string;
  tagEn: string;
  imageUrl?: string | null;
  productId?: string | null;
  skuId?: string | null;
  baumannTypes?: string[] | null;
  baumannReasonRu?: string | null;
  baumannReasonEn?: string | null;
  piProfile?: PiProfile | null;
  marketingBadge?: 'youtuber_pick' | 'retail_top' | null;
};

export type BuildCategory = {
  key: BoxSlotKey;
  labelRu: string;
  labelEn: string;
  products: BuildProduct[];
};

export type BoxBuilderOptionRow = {
  id: string;
  slot: BoxSlotKey;
  sort_order: number;
  brand: string;
  name_ru: string;
  name_en: string;
  tag_ru: string;
  tag_en: string;
  image_url: string | null;
  sku_id: string | null;
  product_id: string | null;
  is_active: boolean;
};

function rowToProduct(row: BoxBuilderOptionRow): BuildProduct {
  return {
    id: row.id,
    brand: row.brand?.trim() || '',
    nameRu: row.name_ru?.trim() || '',
    nameEn: row.name_en?.trim() || '',
    tagRu: row.tag_ru?.trim() || '',
    tagEn: row.tag_en?.trim() || '',
    imageUrl: row.image_url,
    productId: row.product_id,
    skuId: row.sku_id,
  };
}

/** DB 비어 있을 때 /shop/build 폴백 */
export const FALLBACK_BUILD_CATEGORIES: BuildCategory[] = [
  {
    key: 'cleanser',
    labelRu: 'Клинсер',
    labelEn: 'Cleanser',
    products: [
      { id: 'build-cl-1', brand: "S'NATURE", nameRu: 'Пенка для умывания с аминокислотами', nameEn: 'Amino Acid Foam Cleanser', tagRu: 'Мягкое очищение · Все типы', tagEn: 'Gentle · All skin types' },
      { id: 'build-cl-2', brand: 'Make p:rem', nameRu: 'Увлажняющий гель-клинсер Safe Me.', nameEn: 'Safe Me. Relief Moisture Cleanser', tagRu: 'Церамиды · Чувствительная', tagEn: 'Ceramides · Sensitive' },
      { id: 'build-cl-3', brand: 'COSRX', nameRu: 'Гель для умывания с BHA, низкий pH', nameEn: 'Low pH Good Morning Gel Cleanser', tagRu: 'BHA · Жирная кожа', tagEn: 'BHA · Oily skin' },
    ],
  },
  {
    key: 'toner',
    labelRu: 'Тонер',
    labelEn: 'Toner',
    products: [
      { id: 'build-tn-1', brand: 'COSRX', nameRu: 'Тонер с AHA/BHA кислотами', nameEn: 'AHA/BHA Clarifying Treatment Toner', tagRu: 'Отшелушивание · Жирная', tagEn: 'Exfoliating · Oily' },
      { id: 'build-tn-2', brand: 'Bring Green', nameRu: 'Успокаивающий тонер с полынью', nameEn: 'Mugwort Calming Relief Toner', tagRu: 'Полынь · Успокоение', tagEn: 'Mugwort · Soothing' },
      { id: 'build-tn-3', brand: 'Dewytree', nameRu: 'Увлажняющий тонер Ultra Vitalizing', nameEn: 'Ultra Vitalizing Toner', tagRu: 'Гиалуроновая кислота · Увлажнение', tagEn: 'Hyaluronic acid · Hydration' },
    ],
  },
  {
    key: 'serum',
    labelRu: 'Сыворотка',
    labelEn: 'Serum',
    products: [
      { id: 'build-sr-1', brand: "S'NATURE", nameRu: 'Сыворотка с PDRN для восстановления', nameEn: 'PDRN DNA Repair Serum', tagRu: 'PDRN · Регенерация ДНК', tagEn: 'PDRN · DNA repair' },
      { id: 'build-sr-2', brand: 'Numbuzin', nameRu: 'Сыворотка No.3 для разглаживания', nameEn: 'No.3 Skin Softening Serum', tagRu: 'Бифида · Укрепление барьера', tagEn: 'Bifida · Barrier repair' },
      { id: 'build-sr-3', brand: 'COSRX', nameRu: 'Эссенция с муцином улитки 96%', nameEn: 'Advanced Snail 96 Mucin Essence', tagRu: 'Муцин · Восстановление', tagEn: 'Snail mucin · Repair' },
    ],
  },
  {
    key: 'ampoule',
    labelRu: 'Ампула',
    labelEn: 'Ampoule',
    products: [
      { id: 'build-am-1', brand: "S'NATURE", nameRu: 'Ампула с NAD+ для энергии клеток', nameEn: 'NAD+ Energy Boosting Ampoule', tagRu: 'NAD+ · Клеточная энергия', tagEn: 'NAD+ · Cell energy' },
      { id: 'build-am-2', brand: 'Ezieudu', nameRu: 'Ампула с витамином С 25% Vita-C', nameEn: 'Vita-C Boosting Ampoule 25%', tagRu: 'Витамин C 25% · Яркость', tagEn: 'Vitamin C 25% · Brightening' },
      { id: 'build-am-3', brand: 'Numbuzin', nameRu: 'Ниацинамидная сыворотка No.5', nameEn: 'No.5 Vitamin Niacinamide Serum', tagRu: 'Ниацинамид · Выравнивание тона', tagEn: 'Niacinamide · Even tone' },
    ],
  },
  {
    key: 'cream',
    labelRu: 'Крем',
    labelEn: 'Cream',
    products: [
      { id: 'build-cr-1', brand: 'Biodance', nameRu: 'Маска с биоколлагеном и пептидами', nameEn: 'Bio-Collagen Real Deep Mask', tagRu: 'Коллаген · Пептиды', tagEn: 'Collagen · Peptides' },
      { id: 'build-cr-2', brand: 'COSRX', nameRu: 'Крем с церамидами Balancium', nameEn: 'Balancium Comfort Ceramide Cream', tagRu: 'Церамиды · Укрепление', tagEn: 'Ceramides · Barrier' },
      { id: 'build-cr-3', brand: 'Intermission', nameRu: 'Восстанавливающий крем с цикой', nameEn: 'Cica Repair Cream', tagRu: 'Центелла · Успокоение', tagEn: 'Centella · Soothing' },
    ],
  },
  {
    key: 'sunscreen',
    labelRu: 'Санскрин',
    labelEn: 'Sunscreen',
    products: [
      { id: 'build-sun-1', brand: 'Make p:rem', nameRu: 'Санскрин UV Defense Blue Ray SPF50+', nameEn: 'UV Defense Me. Blue Ray Sun Cream SPF50+', tagRu: 'SPF50+ PA++++ · Синий свет', tagEn: 'SPF50+ PA++++ · Blue light' },
      { id: 'build-sun-2', brand: 'Bring Green', nameRu: 'Минеральный санскрин с полынью SPF50', nameEn: 'Mugwort + Cica Sun Cream SPF50', tagRu: 'Минеральный · Чувствительная', tagEn: 'Mineral · Sensitive skin' },
      { id: 'build-sun-3', brand: 'Numbuzin', nameRu: 'Лёгкая сыворотка-санскрин No.1 SPF50+', nameEn: 'No.1 Skin Tint Sun Serum SPF50+', tagRu: 'Сыворотка-текстура · Лёгкий', tagEn: 'Serum texture · Lightweight' },
    ],
  },
];

const FALLBACK_BY_SLOT = Object.fromEntries(
  FALLBACK_BUILD_CATEGORIES.map((c) => [c.key, c.products]),
) as Record<BoxSlotKey, BuildProduct[]>;

type SkuBoxBuilderRow = {
  id: string;
  brand: string | null;
  name: string;
  display_name: string | null;
  name_en: string | null;
  description_ru: string | null;
  image_url: string | null;
  box_builder_slot: BoxSlotKey;
  box_builder_sort_order: number;
  box_builder_tag_ru: string;
  box_builder_tag_en: string;
  ingredients_raw?: string | null;
  baumann_types?: string[] | null;
  baumann_recommend_reason_ru?: string | null;
  baumann_recommend_reason_en?: string | null;
  pi_profile?: PiProfile | null;
};

function skuRowToProduct(row: SkuBoxBuilderRow, productIdBySkuId?: Map<string, string>): BuildProduct {
  let tagRu = row.box_builder_tag_ru?.trim() || '';
  let tagEn = row.box_builder_tag_en?.trim() || '';
  if (row.box_builder_slot === 'sunscreen' && row.ingredients_raw) {
    ({ tagRu, tagEn } = applySunscreenTagFromInci(tagRu, tagEn, row.ingredients_raw));
  }
  if (row.pi_profile?.badges) {
    if (row.pi_profile.badges.ru?.length) tagRu = row.pi_profile.badges.ru.join(' · ');
    if (row.pi_profile.badges.en?.length) tagEn = row.pi_profile.badges.en.join(' · ');
  }
  return {
    id: row.id,
    brand: row.brand?.trim() || '',
    nameRu: row.name_en?.trim() || row.name?.trim() || '',
    nameEn: row.name_en?.trim() || row.name?.trim() || '',
    tagRu,
    tagEn,
    imageUrl: row.image_url,
    skuId: row.id,
    productId: productIdBySkuId?.get(row.id) ?? null,
    baumannTypes: row.baumann_types ?? null,
    baumannReasonRu: row.baumann_recommend_reason_ru ?? null,
    baumannReasonEn: row.baumann_recommend_reason_en ?? null,
    piProfile: row.pi_profile ?? null,
    marketingBadge: row.pi_profile?.marketing_badge ?? null,
  };
}

function categoriesFromGroupedProducts(
  grouped: Partial<Record<BoxSlotKey, BuildProduct[]>>,
): BuildCategory[] {
  return BOX_SLOT_ORDER.map((key) => {
    const labels = BOX_SLOT_LABELS[key];
    const fromDb = grouped[key] ?? [];
    const products = fromDb.length > 0 ? fromDb.slice(0, 6) : (FALLBACK_BY_SLOT[key] ?? []);
    return {
      key,
      labelRu: labels.ru,
      labelEn: labels.en,
      products,
    };
  });
}

async function loadBuildBoxCategoriesFromSkus(client: SupabaseClient): Promise<BuildCategory[] | null> {
  const BASE_COLS = 'id, brand, name, display_name, name_en, description_ru, image_url, box_builder_slot, box_builder_sort_order, box_builder_tag_ru, box_builder_tag_en, ingredients_raw';
  const BAUMANN_COLS = ', baumann_types, baumann_recommend_reason_ru, baumann_recommend_reason_en, pi_profile';

  type QueryResult = { data: unknown[] | null; error: { message: string } | null };

  let result: QueryResult = await client
    .from('sku_items')
    .select(BASE_COLS + BAUMANN_COLS)
    .not('box_builder_slot', 'is', null)
    .eq('is_active', true)
    .order('box_builder_sort_order', { ascending: true }) as unknown as QueryResult;

  // baumann 컬럼이 아직 DB에 없을 경우 컬럼 없이 재시도 (SQL 마이그레이션 전 대비)
  if (result.error?.message?.includes('baumann') || result.error?.message?.includes('pi_profile')) {
    result = await client
      .from('sku_items')
      .select(BASE_COLS)
      .not('box_builder_slot', 'is', null)
      .eq('is_active', true)
      .order('box_builder_sort_order', { ascending: true }) as unknown as QueryResult;
  }

  const { data, error } = result;
  if (error) {
    if (error.message.includes('box_builder_slot')) return null;
    console.warn('[loadBuildBoxCategoriesFromSkus]', error.message);
    return null;
  }

  const rows = (data ?? []) as SkuBoxBuilderRow[];
  if (rows.length === 0) return null;

  const skuIds = rows.map((r) => r.id);
  const productIdBySkuId = new Map<string, string>();
  if (skuIds.length > 0) {
    const { data: links } = await client
      .from('product_components')
      .select('product_id, sku_id')
      .in('sku_id', skuIds);
    for (const link of links ?? []) {
      const sid = (link as { sku_id?: string }).sku_id;
      const pid = (link as { product_id?: string }).product_id;
      if (sid && pid && !productIdBySkuId.has(sid)) {
        productIdBySkuId.set(sid, pid);
      }
    }
  }

  const grouped: Partial<Record<BoxSlotKey, BuildProduct[]>> = {};
  for (const row of rows) {
    const slot = row.box_builder_slot;
    if (!BOX_SLOT_ORDER.includes(slot)) continue;
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot]!.push(skuRowToProduct(row, productIdBySkuId));
  }

  const hasAny = BOX_SLOT_ORDER.some((k) => (grouped[k]?.length ?? 0) > 0);
  if (!hasAny) return null;

  return categoriesFromGroupedProducts(grouped);
}

export async function loadBuildBoxCategories(client: SupabaseClient): Promise<BuildCategory[]> {
  try {
    const fromSkus = await loadBuildBoxCategoriesFromSkus(client);
    if (fromSkus) return fromSkus;

    const { data, error } = await client
      .from('box_builder_options')
      .select('id, slot, sort_order, brand, name_ru, name_en, tag_ru, tag_en, image_url, sku_id, product_id, is_active')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.warn('[loadBuildBoxCategories]', error.message);
      return FALLBACK_BUILD_CATEGORIES;
    }

    const rows = (data ?? []) as BoxBuilderOptionRow[];
    if (rows.length === 0) return FALLBACK_BUILD_CATEGORIES;

    const grouped: Partial<Record<BoxSlotKey, BuildProduct[]>> = {};
    for (const row of rows) {
      const slot = row.slot;
      if (!BOX_SLOT_ORDER.includes(slot)) continue;
      if (!grouped[slot]) grouped[slot] = [];
      grouped[slot]!.push(rowToProduct(row));
    }

    return categoriesFromGroupedProducts(grouped);
  } catch (e) {
    console.warn('[loadBuildBoxCategories]', e);
    return FALLBACK_BUILD_CATEGORIES;
  }
}

export async function loadPremiumBuildProducts(client: SupabaseClient): Promise<BuildProduct[]> {
  try {
    const { data, error } = await client
      .from('sku_items')
      .select(
        'id, brand, name, display_name, name_en, description_ru, image_url, box_builder_slot, box_builder_sort_order, box_builder_tag_ru, box_builder_tag_en, pi_profile',
      )
      .eq('box_builder_slot', 'premium')
      .eq('is_active', true)
      .order('box_builder_sort_order', { ascending: true });

    if (error) {
      if (error.message.includes('box_builder_slot')) return [];
      console.warn('[loadPremiumBuildProducts]', error.message);
      return [];
    }

    const rows = (data ?? []) as SkuBoxBuilderRow[];
    return rows.slice(0, 2).map((row) => skuRowToProduct(row));
  } catch (e) {
    console.warn('[loadPremiumBuildProducts]', e);
    return [];
  }
}

export async function loadAllBoxBuilderOptions(client: SupabaseClient): Promise<BoxBuilderOptionRow[]> {
  const { data, error } = await client
    .from('box_builder_options')
    .select('id, slot, sort_order, brand, name_ru, name_en, tag_ru, tag_en, image_url, sku_id, product_id, is_active')
    .order('slot')
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as BoxBuilderOptionRow[];
}

export function emptyBoxBuilderOption(slot: BoxSlotKey, sortOrder: number): Omit<BoxBuilderOptionRow, 'id'> {
  return {
    slot,
    sort_order: sortOrder,
    brand: '',
    name_ru: '',
    name_en: '',
    tag_ru: '',
    tag_en: '',
    image_url: null,
    sku_id: null,
    product_id: null,
    is_active: true,
  };
}
