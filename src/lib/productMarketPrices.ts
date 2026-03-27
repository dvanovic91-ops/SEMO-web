import type { SupabaseClient } from '@supabase/supabase-js';

export type ProductMarketPriceRow = {
  product_id: string;
  currency: 'RUB' | 'KZT' | 'USD' | 'UZS';
  rrp_price: number | null;
  prp_price: number | null;
};

const FALLBACK_KEY = 'product_market_prices_fallback_v1';

type SettingsRow = {
  key: string;
  value: unknown;
};

type MarketFallbackMap = Record<string, ProductMarketPriceRow[]>;

const normalizeRows = (rows: ProductMarketPriceRow[]) =>
  rows.map((row) => ({
    ...row,
    rrp_price: row.rrp_price === null ? null : Number(row.rrp_price) || null,
    prp_price: row.prp_price === null ? null : Number(row.prp_price) || null,
  }));

async function loadFallbackMap(supabase: SupabaseClient): Promise<MarketFallbackMap> {
  const { data, error } = await supabase.from('site_settings').select('key, value').eq('key', FALLBACK_KEY).maybeSingle();
  if (error || !data) return {};
  const raw = (data as SettingsRow).value;
  if (!raw || typeof raw !== 'object') return {};
  return raw as MarketFallbackMap;
}

async function saveFallbackMap(supabase: SupabaseClient, next: MarketFallbackMap): Promise<void> {
  const { error } = await supabase.from('site_settings').upsert(
    {
      key: FALLBACK_KEY,
      value: next,
    },
    { onConflict: 'key' },
  );
  if (error) throw error;
}

export async function loadProductMarketPrices(supabase: SupabaseClient, productIds: string[]) {
  if (!productIds.length) return new Map<string, ProductMarketPriceRow[]>();
  const { data, error } = await supabase
    .from('product_market_prices')
    .select('product_id, currency, rrp_price, prp_price')
    .in('product_id', productIds);
  if (error || !data) {
    const fallback = await loadFallbackMap(supabase);
    const map = new Map<string, ProductMarketPriceRow[]>();
    productIds.forEach((id) => {
      map.set(id, normalizeRows(fallback[id] ?? []));
    });
    return map;
  }
  const map = new Map<string, ProductMarketPriceRow[]>();
  (data as ProductMarketPriceRow[]).forEach((row) => {
    const list = map.get(row.product_id) ?? [];
    list.push(row);
    map.set(row.product_id, list);
  });
  return map;
}

export async function upsertProductMarketPrices(supabase: SupabaseClient, rows: ProductMarketPriceRow[]) {
  if (!rows.length) return;
  const normalized = normalizeRows(rows);
  const { error } = await supabase.from('product_market_prices').upsert(normalized, { onConflict: 'product_id,currency' });
  if (!error) return;
  // 테이블이 아직 배포되지 않은 환경에서도 관리자 입력값이 사라지지 않도록 안전 저장
  const fallback = await loadFallbackMap(supabase);
  const byProduct: MarketFallbackMap = { ...fallback };
  normalized.forEach((row) => {
    const current = byProduct[row.product_id] ?? [];
    const next = current.filter((item) => item.currency !== row.currency);
    next.push(row);
    byProduct[row.product_id] = next;
  });
  await saveFallbackMap(supabase, byProduct);
}

