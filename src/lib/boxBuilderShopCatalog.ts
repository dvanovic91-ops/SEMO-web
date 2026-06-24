import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppCurrency } from '../context/I18nContext';
import { BOX_SLOT_ORDER, type BoxSlotKey } from './buildBoxCatalog';

export type BoxBuilderShopItem = {
  id: string;
  name: string;
  nameEn: string;
  brand?: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  imageUrls: string[];
  productId: string | null;
  boxTheme?: 'brand' | 'sky' | null;
};

type MarketRow = { rrp_price: number | null; prp_price: number | null };

function resolveDisplayPrices(
  baseRrp: number | null,
  basePrp: number | null,
  market?: MarketRow,
): { price: number; originalPrice: number | null } {
  const hasMarket = market != null && (market.rrp_price != null || market.prp_price != null);
  const useRrp = hasMarket ? (market!.rrp_price ?? baseRrp) : baseRrp;
  const usePrp = hasMarket ? (market!.prp_price ?? market!.rrp_price ?? basePrp) : basePrp;
  return {
    price: usePrp ?? useRrp ?? 0,
    originalPrice: usePrp != null && useRrp != null && usePrp !== useRrp ? useRrp : null,
  };
}

async function loadMarketPriceMap(
  client: SupabaseClient,
  productIds: string[],
  currency: AppCurrency,
): Promise<Record<string, MarketRow>> {
  if (productIds.length === 0) return {};
  const { loadProductMarketPrices } = await import('./productMarketPrices');
  const resultMap = await loadProductMarketPrices(client, productIds);
  const out: Record<string, MarketRow> = {};
  resultMap.forEach((rows, productId) => {
    const row = rows.find((r) => r.currency === currency);
    if (row) {
      out[productId] = {
        rrp_price: row.rrp_price != null ? Number(row.rrp_price) : null,
        prp_price: row.prp_price != null ? Number(row.prp_price) : null,
      };
    }
  });
  return out;
}

/** sku_items 테이블 기반으로 SKU 카탈로그 로드 (박스빌더와 동일한 데이터 소스) */
async function loadFromSkuItems(
  client: SupabaseClient,
  currency: AppCurrency,
): Promise<Partial<Record<BoxSlotKey, BoxBuilderShopItem[]>> | null> {
  const { data, error } = await client
    .from('sku_items')
    .select('id, brand, name, name_en, display_name, description_ru, image_url, box_builder_slot, box_builder_sort_order')
    .not('box_builder_slot', 'is', null)
    .eq('is_active', true)
    .order('box_builder_sort_order', { ascending: true });

  if (error || !data || data.length === 0) return null;

  type SkuRow = {
    id: string;
    brand: string | null;
    name: string;
    name_en: string | null;
    display_name: string | null;
    description_ru: string | null;
    image_url: string | null;
    box_builder_slot: string;
  };
  const rows = data as SkuRow[];

  const skuIds = rows.map((r) => r.id);
  const productIdBySkuId = new Map<string, string>();
  if (skuIds.length > 0) {
    const { data: links } = await client
      .from('product_components')
      .select('product_id, sku_id')
      .in('sku_id', skuIds);
    for (const link of links ?? []) {
      const l = link as { sku_id?: string; product_id?: string };
      if (l.sku_id && l.product_id && !productIdBySkuId.has(l.sku_id)) {
        productIdBySkuId.set(l.sku_id, l.product_id);
      }
    }
  }

  const productIds = [...new Set(productIdBySkuId.values())];
  const [marketPriceMap, basePriceMap] = await Promise.all([
    productIds.length ? loadMarketPriceMap(client, productIds, currency) : Promise.resolve({} as Record<string, MarketRow>),
    (async () => {
      const out: Record<string, MarketRow> = {};
      if (productIds.length === 0) return out;
      const { data: prods } = await client
        .from('products')
        .select('id, rrp_price, prp_price')
        .in('id', productIds);
      for (const p of prods ?? []) {
        const prod = p as { id: string; rrp_price: number | null; prp_price: number | null };
        out[prod.id] = { rrp_price: prod.rrp_price, prp_price: prod.prp_price };
      }
      return out;
    })(),
  ]);

  const grouped: Partial<Record<BoxSlotKey, BoxBuilderShopItem[]>> = {};
  for (const row of rows) {
    const slot = row.box_builder_slot as BoxSlotKey;
    if (!BOX_SLOT_ORDER.includes(slot)) continue;
    const productId = productIdBySkuId.get(row.id) ?? null;
    const base = productId ? (basePriceMap[productId] ?? { rrp_price: null, prp_price: null }) : { rrp_price: null, prp_price: null };
    const { price, originalPrice } = resolveDisplayPrices(
      base.rrp_price != null ? Number(base.rrp_price) : null,
      base.prp_price != null ? Number(base.prp_price) : null,
      productId ? marketPriceMap[productId] : undefined,
    );
    const imageUrl = row.image_url;
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot]!.push({
      id: row.id,
      name: row.name_en?.trim() || row.name?.trim() || '',
      nameEn: row.name_en?.trim() || row.name?.trim() || '',
      brand: row.brand?.trim() || undefined,
      price,
      originalPrice,
      imageUrl,
      imageUrls: imageUrl ? [imageUrl] : [],
      productId,
      boxTheme: 'brand',
    });
  }

  const hasAny = BOX_SLOT_ORDER.some((k) => (grouped[k]?.length ?? 0) > 0);
  return hasAny ? grouped : null;
}

/** products.box_builder_slot 기반 폴백 */
async function loadFromProducts(
  client: SupabaseClient,
  currency: AppCurrency,
): Promise<Partial<Record<BoxSlotKey, BoxBuilderShopItem[]>>> {
  const { data, error } = await client
    .from('products')
    .select('id, name, rrp_price, prp_price, image_url, image_urls, box_builder_slot, box_theme')
    .not('box_builder_slot', 'is', null)
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.warn('[loadBoxBuilderShopSkus]', error.message);
    return {};
  }

  const rows = (data ?? []) as Array<{
    id: string;
    name: string | null;
    rrp_price: number | null;
    prp_price: number | null;
    image_url: string | null;
    image_urls?: string[] | null;
    box_builder_slot: string | null;
    box_theme?: 'brand' | 'sky' | null;
  }>;

  const productIds = rows.map((r) => r.id);
  const marketPriceMap = productIds.length ? await loadMarketPriceMap(client, productIds, currency) : {};

  const grouped: Partial<Record<BoxSlotKey, BoxBuilderShopItem[]>> = {};
  rows.forEach((r, idx) => {
    const slot = r.box_builder_slot as BoxSlotKey;
    if (!BOX_SLOT_ORDER.includes(slot)) return;
    const { price, originalPrice } = resolveDisplayPrices(
      r.rrp_price != null ? Number(r.rrp_price) : null,
      r.prp_price != null ? Number(r.prp_price) : null,
      marketPriceMap[r.id],
    );
    const imageUrls =
      Array.isArray(r.image_urls) && r.image_urls.length
        ? r.image_urls
        : r.image_url
          ? [r.image_url]
          : [];
    if (!grouped[slot]) grouped[slot] = [];
    grouped[slot]!.push({
      id: r.id,
      name: r.name?.trim() || `Продукт ${idx + 1}`,
      nameEn: r.name?.trim() || `Product ${idx + 1}`,
      price,
      originalPrice,
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      productId: r.id,
      boxTheme: r.box_theme ?? 'brand',
    });
  });
  return grouped;
}

/** Shop / Landing — sku_items 우선, products 폴백으로 개별 SKU 카탈로그 로드 */
export async function loadBoxBuilderShopSkus(
  client: SupabaseClient,
  currency: AppCurrency,
): Promise<Partial<Record<BoxSlotKey, BoxBuilderShopItem[]>>> {
  try {
    const fromSkus = await loadFromSkuItems(client, currency);
    if (fromSkus) return fromSkus;
    return await loadFromProducts(client, currency);
  } catch (e) {
    console.warn('[loadBoxBuilderShopSkus]', e);
    return {};
  }
}
