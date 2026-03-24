import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { ShopCardImage } from './ShopCardImage';
import { SemoPageSpinner } from '../components/SemoPageSpinner';

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

/** DB에 슬롯/상품이 없거나 조회 실패 시 보여줄 폴백 제품 5개 (제품목록 빈 화면 방지) */
const FALLBACK_SHOP_ITEMS: ShopItem[] = [1, 2, 3, 4, 5].map((i) => ({
  id: `slot-${i - 1}`,
  name: `Слот ${i}`,
  price: 12000,
  originalPrice: 13000,
  imageUrl: null,
  imageUrls: [],
  productId: `type-${i}` as string | null,
  linkUrl: null,
  boxTheme: i >= 4 ? ('sky' as const) : ('brand' as const),
}));

/** 데스크톱: 3개 + 다음 카드 일부(피크) 노출 */
const VISIBLE_DESKTOP = 3.2;
const itemWidthPercentDesktop = 100 / VISIBLE_DESKTOP;
/** 카드 한 장의 20%를 피크로 사용 (3.2 구성에서 약 6.25%) */
const desktopPeekPercent = itemWidthPercentDesktop * 0.2;

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

function normalizeCategory(raw: unknown): ShopLayoutCategory {
  const v = String(raw ?? 'beauty').trim().toLowerCase();
  if (v === 'inner_beauty' || v === 'inner-beauty' || v === 'inner beauty' || v === 'inner') return 'inner_beauty';
  if (v === 'hair_beauty' || v === 'hair-beauty' || v === 'hair beauty' || v === 'hair') return 'hair_beauty';
  return 'beauty';
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
    isSky
      ? 'flex w-full min-w-0 flex-col items-stretch rounded-xl border border-sky-200 bg-sky-50/60 md:min-h-[420px] md:items-center'
      : 'flex w-full min-w-0 flex-col items-stretch rounded-xl border border-brand/20 bg-brand-soft/25 md:min-h-[420px] md:items-center';
  const pad =
    layout === 'mobile-stack'
      ? 'px-5 pt-5 pb-6 md:px-6 md:pt-5 md:pb-6'
      : 'px-4 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-6';

  const titleClass = isSky
    ? 'prose-ru text-center text-base font-medium leading-snug tracking-wide text-sky-700 md:text-sm'
    : 'prose-ru text-center text-base font-medium leading-snug tracking-wide text-brand md:text-sm';

  const cartBtnClass = isSky
    ? 'inline-flex min-h-11 w-full items-center justify-center rounded-full bg-sky-600 px-4 py-3 text-base font-semibold text-white transition hover:bg-sky-700 md:py-2.5 md:text-sm'
    : 'inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-4 py-3 text-base font-semibold text-white transition hover:bg-brand/90 md:py-2.5 md:text-sm';

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
      ) : (
        <Link
          to={`/product/${product.productId ?? product.id}?catalog=${layoutCategory}`}
          className="flex w-full min-w-0 flex-1 cursor-pointer flex-col items-center md:items-center"
        >
          {cardTop}
        </Link>
      )}
      <div className={buttonWrap}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddToCart(product);
          }}
          className={`${cartBtnClass} ${layout === 'desktop-carousel' ? 'sm:w-auto' : ''}`}
        >
          В корзину
        </button>
      </div>
    </article>
  );
}

/** 관리자 `main_layout_slots.category` 및 상품 `category`와 동일 키 */
export type ShopLayoutCategory = 'beauty' | 'inner_beauty' | 'hair_beauty';

type ShopCatalogProps = {
  category: ShopLayoutCategory;
  pageTitle: string;
  pageSubtitle?: string;
};

/**
 * 카테고리별 샵 페이지 — Beauty / Inner / Hair 동일 레이아웃.
 * 슬롯은 `main_layout_slots.category` 로 구분됩니다.
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
          .from('main_layout_slots')
          .select('slot_index, title, description, image_url, product_id, link_url, category')
          .eq('category', layoutCategory);
        if (slotErr) {
          console.warn('[ShopCatalog] main_layout_slots:', slotErr.message);
          setItems(layoutCategory === 'beauty' ? FALLBACK_SHOP_ITEMS : []);
          setCatalogLoading(false);
          return;
        }
        const slots = ((slotData ?? []) as { slot_index: number; title: string | null; description: string | null; image_url: string | null; product_id: string | null; link_url: string | null }[])
          .slice()
          .sort((a, b) => a.slot_index - b.slot_index);
        if (!slots.length) {
          setItems(layoutCategory === 'beauty' ? FALLBACK_SHOP_ITEMS : []);
          setCatalogLoading(false);
          return;
        }
        // 슬롯은 관리모드 기준으로 최대 5칸을 그대로 노출한다.
        const targetSlotCount = 5;
        const slotByIndex = new Map(slots.map((s) => [s.slot_index, s] as const));
        const normalizedSlots = Array.from({ length: targetSlotCount }, (_, idx) => {
          const found = slotByIndex.get(idx);
          if (found) return found;
          return {
            slot_index: idx,
            title: null,
            description: null,
            image_url: null,
            product_id: null,
            link_url: null,
          };
        });

        const productIds = [...new Set(normalizedSlots.map((s) => s.product_id).filter(Boolean))] as string[];
        let categoryProductIds: string[] = [];
        let allProductIds: string[] = [];
        let productsMap: Record<
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
        // 1) 슬롯에 연결된 상품은 카테고리와 무관하게 항상 먼저 조회(가격/이미지 0 방지)
        if (productIds.length > 0) {
          const { data: slotProducts, error: slotProdErr } = await supabase
            .from('products')
            .select('id, name, category, rrp_price, prp_price, image_url, image_urls, box_theme')
            .in('id', productIds);
          if (slotProdErr) {
            console.warn('[Shop] slot products:', slotProdErr.message);
          } else {
            (slotProducts ?? []).forEach((p: { id: string; name?: string | null; rrp_price: number | null; prp_price: number | null; image_url: string | null; image_urls?: string[] | null; box_theme?: 'brand' | 'sky' | null }) => {
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

        // 2) 자동 보충용: 전체 상품에서 같은 카테고리만 추려 ID 목록 확보
        {
          const { data: allProducts, error: prodErr } = await supabase
            .from('products')
            .select('id, category, name, rrp_price, prp_price, image_url, image_urls, box_theme');
          if (prodErr) {
            console.warn('[Shop] products:', prodErr.message);
          } else {
            const all = (allProducts ?? []) as {
              id: string;
              category?: string | null;
              name?: string | null;
              rrp_price: number | null;
              prp_price: number | null;
              image_url: string | null;
              image_urls?: string[] | null;
              box_theme?: 'brand' | 'sky' | null;
            }[];
            const filtered = all.filter((p) => normalizeCategory(p.category) === layoutCategory);
            all.forEach((p) => {
              productsMap[p.id] = {
                name: p.name ?? null,
                rrp_price: p.rrp_price,
                prp_price: p.prp_price,
                image_url: p.image_url ?? null,
                image_urls: Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : [],
                box_theme: p.box_theme ?? 'brand',
              };
            });
            categoryProductIds = filtered.map((p) => p.id);
            allProductIds = all.map((p) => p.id);
          }
        }

        let list: ShopItem[] = normalizedSlots.map((s: { slot_index: number; title: string | null; image_url: string | null; product_id: string | null; link_url: string | null }) => {
          const productId = s.product_id ?? null;
          const product = productId ? productsMap[productId] : null;
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
          const imageUrls = productId && product ? productImageUrls : s.image_url ? [s.image_url] : [];
          const imageUrl = imageUrls[0] ?? null;
          const boxTheme: 'brand' | 'sky' | null = product?.box_theme ?? (s.slot_index >= 4 ? 'sky' : 'brand');
          return {
            id: productId ?? `slot-${s.slot_index}`,
            name: s.title ?? `Слот ${s.slot_index + 1}`,
            price,
            originalPrice,
            imageUrl,
            imageUrls,
            productId,
            linkUrl: s.link_url ?? null,
            boxTheme,
          };
        });
        // 슬롯 저장이 일부만 된 경우(예: 4개)에도 카탈로그가 갑자기 줄어 보이지 않도록
        // 같은 카테고리의 남은 상품을 뒤에 자동 보충(최대 5개)한다.
        if (list.length < 5 && categoryProductIds.length > 0) {
          const used = new Set(list.map((x) => x.productId).filter(Boolean));
          const remain = categoryProductIds.filter((pid) => !used.has(pid));
          const supplements: ShopItem[] = remain.map((pid, idx) => {
            const product = productsMap[pid];
            const prp = product?.prp_price != null ? Number(product.prp_price) : null;
            const rrp = product?.rrp_price != null ? Number(product.rrp_price) : null;
            const price = prp ?? rrp ?? 0;
            const originalPrice = prp != null && rrp != null ? rrp : null;
            const imageUrls =
              product && Array.isArray(product.image_urls) && product.image_urls.length
                ? product.image_urls
                : product?.image_url
                ? [product.image_url]
                : [];
            return {
              id: pid,
              name: product?.name?.trim() || `Слот ${list.length + idx + 1}`,
              price,
              originalPrice,
              imageUrl: imageUrls[0] ?? null,
              imageUrls,
              productId: pid,
              linkUrl: null,
              boxTheme: product?.box_theme ?? 'brand',
            };
          });
          list = [...list, ...supplements].slice(0, 5);
        }
        // 카테고리 데이터 불일치/라벨 실수로 여전히 부족하면 전체 상품에서 보충해 5개를 보장
        if (list.length < 5 && allProductIds.length > 0) {
          const used = new Set(list.map((x) => x.productId).filter(Boolean));
          const remainAll = allProductIds.filter((pid) => !used.has(pid));
          const supplementsAll: ShopItem[] = remainAll.map((pid, idx) => {
            const product = productsMap[pid];
            const prp = product?.prp_price != null ? Number(product.prp_price) : null;
            const rrp = product?.rrp_price != null ? Number(product.rrp_price) : null;
            const price = prp ?? rrp ?? 0;
            const originalPrice = prp != null && rrp != null ? rrp : null;
            const imageUrls =
              product && Array.isArray(product.image_urls) && product.image_urls.length
                ? product.image_urls
                : product?.image_url
                ? [product.image_url]
                : [];
            return {
              id: pid,
              name: product?.name?.trim() || `Слот ${list.length + idx + 1}`,
              price,
              originalPrice,
              imageUrl: imageUrls[0] ?? null,
              imageUrls,
              productId: pid,
              linkUrl: null,
              boxTheme: product?.box_theme ?? 'brand',
            };
          });
          list = [...list, ...supplementsAll].slice(0, 5);
        }
        setItems(list.slice(0, targetSlotCount));
      } catch (e) {
        console.warn('[ShopCatalog] load error:', e);
        setItems(layoutCategory === 'beauty' ? FALLBACK_SHOP_ITEMS : []);
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
    const thumb = item.imageUrls[0] ?? item.imageUrl ?? null;
    addItem({
      id: item.id,
      name: item.name,
      price: item.price,
      imageUrl: thumb,
      originalPrice: item.originalPrice ?? undefined,
    });
    setShowAddedToast(true);
  };

  return (
    <main className="mx-auto min-w-0 max-w-6xl px-3 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
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

          {/* md 이상: 기존 3열 캐러셀 */}
          <section className="relative hidden min-w-0 px-0 md:block md:px-12 lg:px-16" aria-label="Каталог">
            <div className="overflow-hidden" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div
                className="flex transition-[transform] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                style={{ transform: `translateX(${desktopTranslate})` }}
              >
                {items.map((product) => (
                  <div
                    key={product.id}
                    className="flex shrink-0 flex-col px-2 sm:px-3"
                    style={{ width: `${itemWidthPercentDesktop}%` }}
                  >
                    <ShopProductCard product={product} onAddToCart={handleAddToCart} layoutCategory={layoutCategory} layout="desktop-carousel" />
                  </div>
                ))}
              </div>
            </div>

            {items.length > VISIBLE_DESKTOP && (
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

            {items.length > VISIBLE_DESKTOP && (
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
  <ShopCatalog category="beauty" pageTitle="Курация весна/лето 2026" />
);
