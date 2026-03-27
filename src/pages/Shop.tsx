import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useI18n } from '../context/I18nContext';
import type { AppCurrency } from '../context/I18nContext';
import { supabase } from '../lib/supabase';
import { formatCurrencyAmount } from '../lib/market';
import { loadProductMarketPrices } from '../lib/productMarketPrices';
import { ShopCardImage } from './ShopCardImage';
import { SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../components/SemoPageSpinner';
import {
  CATALOG_ROOM_SLOTS_TABLE,
  CATALOG_SLOT_VISIBLE_BY_ROOM_KEY,
  clampCatalogVisibleCount,
  parseCatalogVisibleByRoom,
  type CatalogSlotRoom,
} from '../lib/catalogSlotRooms';

/** 슬롯 또는 폴백 상품 타입 */
type ShopItem = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
  imageUrls: string[];
  productId: string | null;
  linkUrl: string | null;
  /** 카드 색상: sky 면 연하늘, 아니면 기본 주황 */
  boxTheme?: 'brand' | 'sky' | null;
  /** DB box_history — 메인 뷰티 카탈로그에서는 제외(히스토리 전용 페이지만) */
  boxHistory?: boolean;
};

/** 데스크톱: 4개 + 다음 카드 일부(피크) 노출 */
const VISIBLE_DESKTOP = 4.2;
const itemWidthPercentDesktop = 100 / VISIBLE_DESKTOP;
/** 카드 한 장의 20%를 피크로 사용 (3.2 구성에서 약 6.25%) */
const desktopPeekPercent = itemWidthPercentDesktop * 0.2;

/**
 * products.category 정규화 → 탭 키. 비어 있거나 알 수 없으면 null (어느 카탈로그에도 자동 배치 안 함).
 * 관리자 저장 시 beauty / inner_beauty / hair_beauty 로 고정됨.
 */
function strictProductLayoutKey(raw: unknown): ShopLayoutCategory | null {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v || v === 'null' || v === 'undefined') return null;
  if (v === 'inner_beauty' || v === 'inner-beauty' || v === 'inner beauty' || v === 'inner') return 'inner_beauty';
  if (v === 'hair_beauty' || v === 'hair-beauty' || v === 'hair beauty' || v === 'hair') return 'hair_beauty';
  if (v === 'beauty' || v === 'beautybox' || v === 'beauty_box' || v === 'beauty-box') return 'beauty';
  return null;
}

function productMatchesLayoutCatalog(raw: unknown, layoutCategory: ShopLayoutCategory): boolean {
  return strictProductLayoutKey(raw) === layoutCategory;
}

type ShopProductCardProps = {
  product: ShopItem;
  onAddToCart: (item: ShopItem) => void;
  layoutCategory: ShopLayoutCategory;
  /** 모바일: 세로 풀폭 버튼 / 데스크톱 캐러셀: 가로 나란히 */
  layout: 'mobile-stack' | 'desktop-carousel';
  /** 과거 시즌 히스토리 페이지: 이미지·텍스트 회색 톤, 장바구니 비활성 */
  archiveMode?: boolean;
};

/**
 * 상품 카드 — 모바일은 넓은 1열·충분한 패딩·버튼 min 44px, 데스크톱은 캐러셀 슬롯용
 */
function ShopProductCard({ product, onAddToCart, layoutCategory, layout, archiveMode }: ShopProductCardProps) {
  const { language, currency } = useI18n();
  const archive = Boolean(archiveMode);
  const formatPrice = (price: number) => formatCurrencyAmount(price, currency);
  const articleBase =
    'flex w-full min-w-0 flex-col items-stretch rounded-xl border border-slate-200/80 bg-white md:min-h-[420px] md:items-center shadow-[0_1px_8px_-4px_rgba(15,23,42,0.18)]';
  const archiveTone = archive ? ' grayscale contrast-[0.92]' : '';
  const pad =
    layout === 'mobile-stack'
      ? 'px-5 pt-5 pb-6 md:px-6 md:pt-5 md:pb-6'
      : 'px-4 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-6';

  const titleClass = archive
    ? 'prose-ru text-center text-base font-medium leading-snug tracking-wide text-slate-500 md:text-sm'
    : 'prose-ru text-center text-base font-medium leading-snug tracking-wide text-slate-800 md:text-sm';

  /** 모바일 1열: 장바구니 버튼 가로 절반·가운데 / 캐러셀·md+: 기존 */
  const cartBtnWidth =
    layout === 'mobile-stack'
      ? 'w-1/2 min-w-[9.25rem] max-w-[11.25rem]'
      : 'w-full sm:w-auto';

  const cartBtnClass = archive
    ? `inline-flex min-h-9 ${cartBtnWidth} cursor-not-allowed items-center justify-center rounded-full border border-slate-300 bg-slate-200 px-4 py-2 text-sm font-medium leading-tight text-slate-500 md:min-h-8 md:py-1.5`
    : `inline-flex min-h-9 ${cartBtnWidth} items-center justify-center rounded-full border border-brand/90 bg-brand px-4 py-2 text-sm font-medium leading-tight text-white transition hover:bg-brand/90 md:min-h-8 md:py-1.5`;

  const buttonWrap =
    layout === 'mobile-stack'
      ? 'mt-5 flex w-full min-w-0 flex-col items-center gap-3'
      : 'mt-4 flex w-full min-w-0 flex-col items-center gap-2 sm:flex-row sm:justify-center';

  const cardTop = (
    <>
      <p className={titleClass}>{product.name}</p>
      <div className="mt-2 w-full min-w-0 md:mt-0">
        <ShopCardImage
          images={product.imageUrls.length ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []}
          name={product.name}
          layout={layout === 'mobile-stack' ? 'mobile' : 'desktop'}
        />
      </div>
      {/* История боксов: только RRP (рекомендованная цена), без PRP — в каталоге не показываем скидочную цену */}
      <div className="mt-4 flex flex-col items-center gap-1 text-center md:gap-0.5">
        {archive ? (
          <span className="text-lg font-semibold text-slate-600 md:text-base">
            {formatPrice(product.originalPrice != null ? product.originalPrice : product.price)}
          </span>
        ) : (
          <>
            {product.originalPrice != null && (
              <span className="text-sm line-through text-slate-500 md:text-sm">
                {formatPrice(product.originalPrice)}
              </span>
            )}
            <span className="text-lg font-semibold text-slate-900 md:text-base">
              {formatPrice(product.price)}
            </span>
          </>
        )}
      </div>
    </>
  );

  return (
    <article className={`${articleBase} ${pad}${archiveTone}`}>
      {product.linkUrl ? (
        <a href={product.linkUrl} className="flex w-full min-w-0 flex-1 flex-col items-center md:items-center">
          {cardTop}
        </a>
      ) : product.productId ? (
        <Link
          to={`/product/${product.productId}?catalog=${layoutCategory}`}
          className="flex w-full min-w-0 flex-1 cursor-pointer flex-col items-center md:items-center"
        >
          {cardTop}
        </Link>
      ) : (
        <div className="flex w-full min-w-0 flex-1 flex-col items-center md:items-center opacity-90">{cardTop}</div>
      )}
      <div className={buttonWrap}>
        <button
          type="button"
          disabled={!product.productId || archive}
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          className={`${cartBtnClass} ${layout === 'desktop-carousel' ? 'sm:w-auto' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {archive ? (language === 'en' ? 'Unavailable' : 'Нет в продаже') : language === 'en' ? 'Add to cart' : 'В корзину'}
        </button>
      </div>
    </article>
  );
}

/** 뷰티 / 핏 / 헤어 카탈로그 키 — DB 룸 테이블(`catalogSlotRooms`)과 1:1 */
export type ShopLayoutCategory = CatalogSlotRoom;

const PRODUCTS_SELECT_FULL = 'id, category, name, rrp_price, prp_price, image_url, image_urls, box_theme, box_history';
const PRODUCTS_SELECT_MIN = 'id, category, name, rrp_price, prp_price, image_url';

type ProductRowShop = {
  id: string;
  category?: string | null;
  name?: string | null;
  rrp_price: number | null;
  prp_price: number | null;
  image_url: string | null;
  image_urls?: string[] | null;
  box_theme?: 'brand' | 'sky' | null;
  box_history?: boolean | null;
};

type MarketPriceRow = {
  product_id: string;
  currency: AppCurrency;
  rrp_price: number | null;
  prp_price: number | null;
};

type MarketPriceMap = Record<string, Partial<Record<AppCurrency, { rrp_price: number | null; prp_price: number | null }>>>;

async function loadMarketPriceMap(
  client: NonNullable<typeof supabase>,
  productIds: string[],
): Promise<MarketPriceMap> {
  if (!productIds.length) return {};
  // site_settings 폴백 포함한 공통 로더 사용 (Admin과 동일 경로)
  const resultMap = await loadProductMarketPrices(client, productIds);
  const map: MarketPriceMap = {};
  resultMap.forEach((rows, productId) => {
    map[productId] = {};
    rows.forEach((row) => {
      const c = row.currency as AppCurrency;
      map[productId][c] = {
        rrp_price: row.rrp_price != null ? Number(row.rrp_price) : null,
        prp_price: row.prp_price != null ? Number(row.prp_price) : null,
      };
    });
  });
  return map;
}

function resolveDisplayPrices(
  baseRrp: number | null,
  basePrp: number | null,
  _currency: AppCurrency,
  marketPrice?: { rrp_price: number | null; prp_price: number | null },
) {
  // market row가 존재하고 실제 값이 있으면 사용, null이면 base(RUB) 폴백
  const hasMarket = marketPrice != null &&
    (marketPrice.rrp_price != null || marketPrice.prp_price != null);
  const useRrp = hasMarket ? (marketPrice!.rrp_price ?? baseRrp) : baseRrp;
  const usePrp = hasMarket ? (marketPrice!.prp_price ?? marketPrice!.rrp_price ?? basePrp) : basePrp;
  const price = usePrp ?? useRrp ?? 0;
  const originalPrice = usePrp != null && useRrp != null && usePrp !== useRrp ? useRrp : null;
  return { price, originalPrice };
}

/** 스키마에 image_urls/box_theme 없으면 전체 select 가 400 → 최소 컬럼으로 재시도 (Admin 과 동일 패턴) */
async function fetchProductsWithSchemaFallback(
  client: NonNullable<typeof supabase>,
  applyFilter: (q: ReturnType<typeof client.from>) => ReturnType<typeof client.from>,
): Promise<ProductRowShop[]> {
  let q = client.from('products').select(PRODUCTS_SELECT_FULL).order('name');
  q = applyFilter(q);
  let { data, error } = await q;
  if (error) {
    console.warn('[ShopCatalog] products 전체 컬럼 조회 실패 → 최소 컬럼 재시도:', error.message);
    let q2 = client.from('products').select(PRODUCTS_SELECT_MIN).order('name');
    q2 = applyFilter(q2);
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
  }
  if (error) {
    console.warn('[ShopCatalog] products 조회 실패:', error.message);
    return [];
  }
  return (data ?? []) as ProductRowShop[];
}

function rowsToShopItems(
  rows: ProductRowShop[],
  max: number,
  currency: AppCurrency,
  marketPriceMap: MarketPriceMap = {},
): ShopItem[] {
  return rows.slice(0, max).map((p, idx) => {
    const prp = p.prp_price != null ? Number(p.prp_price) : null;
    const rrp = p.rrp_price != null ? Number(p.rrp_price) : null;
    const market = marketPriceMap[p.id]?.[currency];
    const { price, originalPrice } = resolveDisplayPrices(rrp, prp, currency, market);
    const imageUrls =
      Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : [];
    return {
      id: p.id,
      name: p.name?.trim() || `Слот ${idx + 1}`,
      price,
      originalPrice,
      imageUrl: imageUrls[0] ?? null,
      imageUrls,
      productId: p.id,
      linkUrl: null,
      boxTheme: p.box_theme ?? 'brand',
    };
  });
}

function filterRowsForCatalog(rows: ProductRowShop[], layoutCategory: ShopLayoutCategory): ProductRowShop[] {
  return rows.filter((p) => {
    const pk = strictProductLayoutKey(p.category);
    return pk === layoutCategory;
  });
}

/** 뷰티: 한글·오타 등으로 category 필터가 0건일 때, 핏/헤어로 확정된 것만 제외하고 채움 */
async function fetchBeautyRowsLoose(client: NonNullable<typeof supabase>, max: number): Promise<ProductRowShop[]> {
  let q = client.from('products').select(PRODUCTS_SELECT_FULL).order('name').limit(120);
  let { data, error } = await q;
  if (error) {
    let q2 = client.from('products').select(PRODUCTS_SELECT_MIN).order('name').limit(120);
    const r2 = await q2;
    data = r2.data;
    error = r2.error;
  }
  if (error) return [];
  const rows = (data ?? []) as ProductRowShop[];
  return rows
    .filter((p) => {
      const pk = strictProductLayoutKey(p.category);
      return pk !== 'inner_beauty' && pk !== 'hair_beauty';
    })
    .slice(0, max);
}

/** 슬롯 행이 없을 때·에러 시: 카테고리 상품으로 채움 */
async function buildShopItemsFromCategoryProducts(
  client: NonNullable<typeof supabase>,
  layoutCategory: ShopLayoutCategory,
  max: number,
  currency: AppCurrency,
): Promise<ShopItem[]> {
  const applyFilter =
    layoutCategory === 'beauty'
      ? (q: ReturnType<NonNullable<typeof supabase>['from']>) => q.or('category.eq.beauty,category.is.null')
      : (q: ReturnType<NonNullable<typeof supabase>['from']>) => q.eq('category', layoutCategory);

  let rows = await fetchProductsWithSchemaFallback(client, applyFilter);
  let filtered = filterRowsForCatalog(rows, layoutCategory);

  if (filtered.length === 0 && layoutCategory === 'beauty') {
    const loose = await fetchBeautyRowsLoose(client, max);
    if (loose.length > 0) {
      console.warn('[ShopCatalog] 뷰티: 엄격 category 필터 결과 0건 → 핏/헤어 제외 폴백 사용');
      filtered = loose;
    }
  }

  if (filtered.length === 0 && layoutCategory !== 'beauty') {
    const all = await fetchProductsWithSchemaFallback(client, (q) => q);
    filtered = filterRowsForCatalog(all, layoutCategory).slice(0, max);
  }

  // 뷰티: 과거 시즌(box_history) 상품은 메인 카탈로그 폴백에서 제외
  if (layoutCategory === 'beauty') {
    filtered = filtered.filter((p) => !p.box_history);
  }

  const productIds = filtered.map((p) => p.id);
  const marketPriceMap = await loadMarketPriceMap(client, productIds);
  return rowsToShopItems(filtered, max, currency, marketPriceMap);
}

type ShopCatalogProps = {
  category: ShopLayoutCategory;
  pageTitle: string;
  pageSubtitle?: string;
};

/**
 * 카테고리별 샵 페이지 — Beauty / Inner / Hair 동일 레이아웃.
 * 슬롯은 `catalog_room_slots` 한 테이블에서 `.eq('catalog_room', …)` 로만 읽음.
 */
export function ShopCatalog({ category: layoutCategory, pageTitle, pageSubtitle }: ShopCatalogProps) {
  const { language, currency } = useI18n();
  const { addItem } = useCart();
  const [showAddedToast, setShowAddedToast] = useState(false);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    setCarouselIndex(0);
  }, [layoutCategory]);

  useEffect(() => {
    if (!supabase) {
      setItems([]);
      setCatalogLoading(false);
      return;
    }
    setCatalogLoading(true);
    (async () => {
      try {
        const [{ data: slotData, error: slotErr }, { data: visRow }] = await Promise.all([
          supabase
            .from(CATALOG_ROOM_SLOTS_TABLE)
            .select('id, slot_index, title, description, image_url, product_id, link_url')
            .eq('catalog_room', layoutCategory),
          supabase.from('site_settings').select('value').eq('key', CATALOG_SLOT_VISIBLE_BY_ROOM_KEY).maybeSingle(),
        ]);
        if (slotErr) {
          console.warn('[ShopCatalog] catalog_room_slots:', slotErr.message);
          setItems(await buildShopItemsFromCategoryProducts(supabase, layoutCategory, 5, currency));
          setCatalogLoading(false);
          return;
        }
        type SlotRow = {
          id?: number;
          slot_index: number;
          title: string | null;
          description: string | null;
          image_url: string | null;
          product_id: string | null;
          link_url: string | null;
        };
        const slots = ((slotData ?? []) as SlotRow[]).slice().sort((a, b) => {
          const d = a.slot_index - b.slot_index;
          if (d !== 0) return d;
          return (a.id ?? 0) - (b.id ?? 0);
        });
        if (!slots.length) {
          setItems(await buildShopItemsFromCategoryProducts(supabase, layoutCategory, 5, currency));
          setCatalogLoading(false);
          return;
        }
        const visMap = parseCatalogVisibleByRoom(visRow?.value);
        const fallbackVisible = Math.min(5, Math.max(1, slots.length));
        const targetVisible = clampCatalogVisibleCount(visMap[layoutCategory] ?? fallbackVisible, fallbackVisible);
        // DB에 slot_index 가 구멍 나 있으면 정렬 후 앞에서 targetVisible 개만 쓰고 표시 순서는 0..n-1 로 압축
        const normalizedSlots: SlotRow[] = slots.slice(0, targetVisible).map((row, i) => ({
          ...row,
          slot_index: i,
        }));

        const productIds = [...new Set(normalizedSlots.map((s) => s.product_id).filter(Boolean))] as string[];
        const marketPriceMap = await loadMarketPriceMap(supabase, productIds);
        const productsMap: Record<
          string,
          {
            name?: string | null;
            rrp_price: number | null;
            prp_price: number | null;
            image_url: string | null;
            image_urls: string[];
            box_theme: 'brand' | 'sky' | null;
            box_history?: boolean | null;
          }
        > = {};
        // 1) 슬롯에 연결된 상품 — 행은 이미 catalog_room 으로 구분됨. category 문자열이 DB와 어긋나도 슬롯에 넣은 UUID는 그대로 표시(안 그러면 0₽·플레이스홀더만 뜸)
        if (productIds.length > 0) {
          let slotProdRes = await supabase.from('products').select(PRODUCTS_SELECT_FULL).in('id', productIds);
          if (slotProdRes.error) {
            console.warn('[Shop] 슬롯 상품 전체 컬럼 조회 실패 → 최소 컬럼:', slotProdRes.error.message);
            slotProdRes = await supabase.from('products').select(PRODUCTS_SELECT_MIN).in('id', productIds);
          }
          const slotProducts = slotProdRes.data;
          const slotProdErr = slotProdRes.error;
          if (slotProdErr) {
            console.warn('[Shop] slot products:', slotProdErr.message);
          } else {
            (
              slotProducts ?? []
            ).forEach(
              (p: {
                id: string;
                category?: string | null;
                name?: string | null;
                rrp_price: number | null;
                prp_price: number | null;
                image_url: string | null;
                image_urls?: string[] | null;
                box_theme?: 'brand' | 'sky' | null;
                box_history?: boolean | null;
              }) => {
              const pk = strictProductLayoutKey(p.category);
              if (pk != null && pk !== layoutCategory) {
                console.warn('[ShopCatalog] 카테고리 불일치 상품 제외:', p.id, p.category, '≠', layoutCategory);
                return; // 카테고리 불일치 상품 제외
              }
              productsMap[p.id] = {
                name: p.name ?? null,
                rrp_price: p.rrp_price,
                prp_price: p.prp_price,
                image_url: p.image_url ?? null,
                image_urls: Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : [],
                box_theme: p.box_theme ?? 'brand',
                box_history: p.box_history ?? false,
              };
            });
          }
        }

        const list: ShopItem[] = normalizedSlots.map((s: { slot_index: number; title: string | null; image_url: string | null; product_id: string | null; link_url: string | null }) => {
          const rawPid = s.product_id ?? null;
          const product = rawPid ? productsMap[rawPid] : null;
          const productId = product ? rawPid : null;
          const prp = product?.prp_price != null ? Number(product.prp_price) : null;
          const rrp = product?.rrp_price != null ? Number(product.rrp_price) : null;
          const market = productId ? marketPriceMap[productId]?.[currency] : undefined;
          const { price, originalPrice } = resolveDisplayPrices(rrp, prp, currency, market);

          const productImageUrls =
            product && Array.isArray(product.image_urls) && product.image_urls.length
              ? product.image_urls
              : product && product.image_url
                ? [product.image_url]
                : [];
          const slotImg = s.image_url?.trim() || null;
          // 연결 상품이 있으면 상품 갤러리 우선(관리자 사진 갱신 반영). 갤러리가 비었을 때만 슬롯 URL 사용
          const imageUrls =
            productId && product && productImageUrls.length > 0
              ? productImageUrls
              : slotImg
                ? [slotImg]
                : [];
          const imageUrl = imageUrls[0] ?? null;
          const boxTheme: 'brand' | 'sky' | null = product?.box_theme ?? (s.slot_index >= 4 ? 'sky' : 'brand');
          const boxHistory = Boolean(product?.box_history);
          return {
            id: productId ?? `slot-${s.slot_index}`,
            name: (product?.name?.trim() || s.title || `Слот ${s.slot_index + 1}`).trim(),
            price,
            originalPrice,
            imageUrl,
            imageUrls,
            productId,
            linkUrl: s.link_url ?? null,
            boxTheme,
            boxHistory,
          };
        });
        // 슬롯에 UUID는 있으나 카테고리 불일치·삭제 등으로 상품을 못 붙인 행은 노출하지 않음.
        // 뷰티: box_history(과거 시즌) 상품은 메인 카탈로그에서 제외 → «История боксов» 전용
        setItems(list.filter((item) => item.productId != null && !item.boxHistory));
      } catch (e) {
        console.warn('[ShopCatalog] load error:', e);
        setItems(await buildShopItemsFromCategoryProducts(supabase, layoutCategory, 5, currency));
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, [layoutCategory, currency]);

  useEffect(() => {
    if (!showAddedToast) return;
    const t = setTimeout(() => setShowAddedToast(false), 2500);
    return () => clearTimeout(t);
  }, [showAddedToast]);

  // 3.2(3개+피크) 구성에서는 ceil을 쓰면 마지막 카드에 도달하지 못할 수 있어 floor 기준 사용
  const maxIndex = Math.max(0, items.length - Math.floor(VISIBLE_DESKTOP));
  const goPrev = () => setCarouselIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCarouselIndex((i) => Math.min(maxIndex, i + 1));
  const middlePeekAdjust = desktopPeekPercent * 0.65;
  const desktopTranslate = `calc(-${carouselIndex * itemWidthPercentDesktop}% + ${
    carouselIndex > 0 ? (carouselIndex < maxIndex ? middlePeekAdjust : desktopPeekPercent) : 0
  }%)`;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) goPrev();
    else if (dx < -50) goNext();
  };

  const handleAddToCart = (item: ShopItem) => {
    if (!item.productId) return;
    const thumb = item.imageUrls[0] ?? item.imageUrl ?? null;
    addItem({
      id: item.productId,
      name: item.name,
      price: item.price,
      imageUrl: thumb,
      originalPrice: item.originalPrice ?? undefined,
      currency,
    });
    setShowAddedToast(true);
  };

  return (
    <main className="mx-auto min-w-0 w-full max-w-[96rem] px-3 py-5 sm:px-6 sm:py-10 md:px-8 md:py-14">
      <header
        className={layoutCategory === 'beauty' ? 'mb-6 md:mb-12' : 'mb-12'}
      >
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 whitespace-nowrap sm:text-3xl md:text-4xl">
          {pageTitle}
        </h1>
        {pageSubtitle && layoutCategory === 'beauty' ? (
          <>
            {/* 모바일: 소제목만(히스토리 링크는 카드 목록 아래 우측) */}
            <p className="prose-ru mx-auto mt-6 max-w-2xl px-3 text-center text-base font-bold italic leading-relaxed text-brand sm:text-lg md:hidden">
              {pageSubtitle}
            </p>
            {/* md+: 부제만 가운데 — «История боксов»는 데스크톱 카탈로그(슬롯) 아래 우측 */}
            <p className="prose-ru mx-auto mt-8 hidden max-w-2xl px-3 text-center text-base font-bold italic leading-relaxed text-brand sm:text-lg md:block md:px-8 lg:px-10">
              {pageSubtitle}
            </p>
          </>
        ) : pageSubtitle ? (
          <p className="prose-ru mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-600 sm:text-base">
            {pageSubtitle}
          </p>
        ) : null}
      </header>

      {catalogLoading ? (
        <div className={SEMO_SECTION_LOADING_CLASS} aria-busy="true">
          <SemoPageSpinner />
        </div>
      ) : items.length === 0 ? (
        <>
          <p className="py-16 text-center text-sm text-slate-500">
            {layoutCategory === 'beauty'
              ? language === 'en'
                ? 'Catalog is temporarily unavailable.'
                : 'Каталог временно недоступен.'
              : language === 'en'
                ? 'Collection is coming soon — stay tuned.'
                : 'Подборка скоро появится — следите за обновлениями.'}
          </p>
          {layoutCategory === 'beauty' ? (
            <div className="mb-10 hidden translate-x-[3vw] justify-start pl-2 sm:pl-3 md:flex md:px-8 lg:px-10">
              <Link
                to="/shop/box-history"
                className="text-[calc(0.875rem-1pt)] font-medium text-slate-500 underline-offset-4 transition hover:text-slate-600 hover:underline sm:text-[calc(1rem-1pt)]"
              >
                ← {language === 'en' ? 'Box history' : 'История боксов'}
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* 모바일·태블릿(md 미만): 1열 풀폭 카드 — 가독성·터치 영역 */}
          <section className="w-full min-w-0 md:hidden" aria-label="Каталог — мобильная версия">
            <div className="flex flex-col gap-6">
              {items.map((product) => (
                <div key={product.id} className="w-full min-w-0">
                  <ShopProductCard
                    product={product}
                    onAddToCart={handleAddToCart}
                    layoutCategory={layoutCategory}
                    layout="mobile-stack"
                  />
                </div>
              ))}
            </div>
            {layoutCategory === 'beauty' ? (
              <div className="mt-3 flex justify-start px-3">
                <Link
                  to="/shop/box-history"
                  className="text-[calc(0.875rem-1pt)] font-medium text-slate-500 underline-offset-4 transition hover:text-slate-600 hover:underline"
                >
                  ← {language === 'en' ? 'Box history' : 'История боксов'}
                </Link>
              </div>
            ) : null}
          </section>

          {/* md 이상: 상품 수에 따라 중앙 정렬 or 캐러셀 */}
          <section className="relative hidden min-w-0 px-0 md:block md:px-8 lg:px-10" aria-label="Каталог">
            <div className="overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div
                className={`flex transition-[transform] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
                  items.length <= Math.floor(VISIBLE_DESKTOP) ? 'justify-center' : ''
                }`}
                style={items.length > Math.floor(VISIBLE_DESKTOP) ? { transform: `translateX(${desktopTranslate})` } : undefined}
              >
                {items.map((product) => (
                  <div
                    key={product.id}
                    className="flex shrink-0 flex-col px-2 sm:px-3"
                    style={{ width: items.length <= Math.floor(VISIBLE_DESKTOP)
                      ? `${Math.min(itemWidthPercentDesktop, 100 / Math.max(items.length, 1))}%`
                      : `${itemWidthPercentDesktop}%`
                    }}
                  >
                    <ShopProductCard product={product} onAddToCart={handleAddToCart} layoutCategory={layoutCategory} layout="desktop-carousel" />
                  </div>
                ))}
              </div>
            </div>

            {items.length > Math.floor(VISIBLE_DESKTOP) && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={carouselIndex === 0}
                  className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30"
                  aria-label={language === 'en' ? 'Previous' : 'Предыдущие'}
                >
                  <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={carouselIndex >= maxIndex}
                  className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30"
                  aria-label={language === 'en' ? 'Next' : 'Следующие'}
                >
                  <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {items.length > Math.floor(VISIBLE_DESKTOP) && (
              <div className="mt-4 flex justify-center gap-2">
                {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCarouselIndex(i)}
                    className={`h-2 rounded-full transition ${i === carouselIndex ? 'w-6 bg-brand' : 'w-2 bg-slate-200'}`}
                    aria-label={language === 'en' ? `Slide ${i + 1}` : `Слайд ${i + 1}`}
                  />
                ))}
              </div>
            )}

            {/* 데스크톱 뷰티박스: 히스토리 — 모바일과 동일 «←» 유니코드 */}
            {layoutCategory === 'beauty' ? (
              <div className="mt-8 hidden translate-x-[3vw] justify-start pl-2 sm:pl-3 md:flex">
                <Link
                  to="/shop/box-history"
                  className="text-[calc(0.875rem-1pt)] font-medium text-slate-500 underline-offset-4 transition hover:text-slate-600 hover:underline sm:text-[calc(1rem-1pt)]"
                >
                  ← {language === 'en' ? 'Box history' : 'История боксов'}
                </Link>
              </div>
            ) : null}
          </section>
        </>
      )}

      {showAddedToast && (
        <div
          className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6"
          role="status"
          aria-live="polite"
        >
          {language === 'en' ? 'Added to cart' : 'Добавлен в корзину'}
        </div>
      )}
    </main>
  );
}

export const Shop: React.FC = () => (
  <ShopCatalog category="beauty" pageTitle="Beauty box" pageSubtitle="S/S 2026 SEMO selection" />
);

/** 히스토리 페이지 등에서 카드 재사용 */
export { ShopProductCard };
export type { ShopItem };
