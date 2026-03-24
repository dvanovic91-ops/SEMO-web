import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { ShopCardImage } from './ShopCardImage';
import { SemoPageSpinner } from '../components/SemoPageSpinner';
import { CATALOG_ROOM_SLOTS_TABLE, type CatalogSlotRoom } from '../lib/catalogSlotRooms';

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
};

/** 데스크톱: 4개 + 다음 카드 일부(피크) 노출 */
const VISIBLE_DESKTOP = 4.2;
const itemWidthPercentDesktop = 100 / VISIBLE_DESKTOP;
/** 카드 한 장의 20%를 피크로 사용 (3.2 구성에서 약 6.25%) */
const desktopPeekPercent = itemWidthPercentDesktop * 0.2;

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

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
};

/**
 * 상품 카드 — 모바일은 넓은 1열·충분한 패딩·버튼 min 44px, 데스크톱은 캐러셀 슬롯용
 */
function ShopProductCard({ product, onAddToCart, layoutCategory, layout }: ShopProductCardProps) {
  const isSky = (product.boxTheme ?? 'brand') === 'sky';
  const articleBase =
    'flex w-full min-w-0 flex-col items-stretch rounded-xl border border-slate-200/80 bg-white md:min-h-[420px] md:items-center shadow-[0_1px_8px_-4px_rgba(15,23,42,0.18)]';
  const pad =
    layout === 'mobile-stack'
      ? 'px-5 pt-5 pb-6 md:px-6 md:pt-5 md:pb-6'
      : 'px-4 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-6';

  const titleClass = 'prose-ru text-center text-base font-medium leading-snug tracking-wide text-slate-800 md:text-sm';

  const cartBtnClass =
    'inline-flex min-h-9 w-full items-center justify-center rounded-full border border-brand/90 bg-brand px-4 py-2 text-sm font-medium leading-tight text-white transition hover:bg-brand/90 md:min-h-8 md:py-1.5';

  const buttonWrap =
    layout === 'mobile-stack'
      ? 'mt-5 flex w-full min-w-0 flex-col gap-3'
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
      <div className="mt-4 flex flex-col items-center gap-1 text-center md:gap-0.5">
        {product.originalPrice != null && (
          <span className="text-sm text-slate-500 line-through md:text-sm">{formatPrice(product.originalPrice)}</span>
        )}
        <span className="text-lg font-semibold text-slate-900 md:text-base">{formatPrice(product.price)}</span>
      </div>
    </>
  );

  return (
    <article className={`${articleBase} ${pad}`}>
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
          disabled={!product.productId}
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          className={`${cartBtnClass} ${layout === 'desktop-carousel' ? 'sm:w-auto' : ''} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          В корзину
        </button>
      </div>
    </article>
  );
}

/** 뷰티 / 핏 / 헤어 카탈로그 키 — DB 룸 테이블(`catalogSlotRooms`)과 1:1 */
export type ShopLayoutCategory = CatalogSlotRoom;

const PRODUCTS_SELECT_FULL = 'id, category, name, rrp_price, prp_price, image_url, image_urls, box_theme';
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
};

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

function rowsToShopItems(rows: ProductRowShop[], max: number): ShopItem[] {
  return rows.slice(0, max).map((p, idx) => {
    const prp = p.prp_price != null ? Number(p.prp_price) : null;
    const rrp = p.rrp_price != null ? Number(p.rrp_price) : null;
    const price = prp ?? rrp ?? 0;
    const imageUrls =
      Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : [];
    return {
      id: p.id,
      name: p.name?.trim() || `Слот ${idx + 1}`,
      price,
      originalPrice: prp != null && rrp != null ? rrp : null,
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

  return rowsToShopItems(filtered, max);
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
        const { data: slotData, error: slotErr } = await supabase
          .from(CATALOG_ROOM_SLOTS_TABLE)
          .select('id, slot_index, title, description, image_url, product_id, link_url')
          .eq('catalog_room', layoutCategory);
        if (slotErr) {
          console.warn('[ShopCatalog] catalog_room_slots:', slotErr.message);
          setItems(await buildShopItemsFromCategoryProducts(supabase, layoutCategory, 5));
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
          setItems(await buildShopItemsFromCategoryProducts(supabase, layoutCategory, 5));
          setCatalogLoading(false);
          return;
        }
        // 관리자가 저장한 슬롯 개수(1~5)만큼만 노출
        const targetSlotCount = Math.min(5, Math.max(1, slots.length));
        // DB에 slot_index 가 0,3,4,5,6 처럼 구멍이 있으면, 예전 로직은 1·2번을 빈 슬롯으로 만들고 뒤로 밀려 순서가 뒤섞임 → 정렬 후 앞에서 5개만 쓰고 표시 순서는 0..n-1 으로 압축
        const normalizedSlots: SlotRow[] = slots.slice(0, targetSlotCount).map((row, i) => ({
          ...row,
          slot_index: i,
        }));

        const productIds = [...new Set(normalizedSlots.map((s) => s.product_id).filter(Boolean))] as string[];
        const productsMap: Record<
          string,
          {
            name?: string | null;
            rrp_price: number | null;
            prp_price: number | null;
            image_url: string | null;
            image_urls: string[];
            box_theme: 'brand' | 'sky' | null;
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
            (slotProducts ?? []).forEach((p: { id: string; category?: string | null; name?: string | null; rrp_price: number | null; prp_price: number | null; image_url: string | null; image_urls?: string[] | null; box_theme?: 'brand' | 'sky' | null }) => {
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
          const price = prp ?? rrp ?? 0;
          const originalPrice = prp != null && rrp != null ? rrp : null;

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
          };
        });
        setItems(list.slice(0, targetSlotCount));
      } catch (e) {
        console.warn('[ShopCatalog] load error:', e);
        setItems(await buildShopItemsFromCategoryProducts(supabase, layoutCategory, 5));
      } finally {
        setCatalogLoading(false);
      }
    })();
  }, [layoutCategory]);

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
    });
    setShowAddedToast(true);
  };

  return (
    <main className="mx-auto min-w-0 w-full max-w-[96rem] px-3 py-5 sm:px-6 sm:py-10 md:px-8 md:py-14">
      <header className="mb-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-brand whitespace-nowrap sm:text-4xl md:text-5xl">
          {pageTitle}
        </h1>
        {pageSubtitle ? (
          <p className="prose-ru mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-slate-600 sm:text-base">
            {pageSubtitle}
          </p>
        ) : null}
      </header>

      {catalogLoading ? (
        <div className="py-16">
          <SemoPageSpinner />
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-slate-500">
          {layoutCategory === 'beauty'
            ? 'Каталог временно недоступен.'
            : 'Подборка скоро появится — следите за обновлениями.'}
        </p>
      ) : (
        <>
          {/* 모바일·태블릿(md 미만): 1열 풀폭 카드 — 가독성·터치 영역 */}
          <section className="w-full min-w-0 md:hidden" aria-label="Каталог — мобильная версия">
            <div className="flex flex-col gap-6">
              {items.map((product) => (
                <div key={product.id} className="w-full min-w-0">
                  <ShopProductCard product={product} onAddToCart={handleAddToCart} layoutCategory={layoutCategory} layout="mobile-stack" />
                </div>
              ))}
            </div>
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
                  aria-label="Предыдущие"
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
                  aria-label="Следующие"
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
                    aria-label={`Слайд ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {showAddedToast && (
        <div
          className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6"
          role="status"
          aria-live="polite"
        >
          Добавлен в корзину
        </div>
      )}
    </main>
  );
}

export const Shop: React.FC = () => (
  <ShopCatalog category="beauty" pageTitle="Beauty box" pageSubtitle="S/S 2026: Выбор SEMO" />
);
