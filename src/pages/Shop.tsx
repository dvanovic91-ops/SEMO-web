import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { ShopCardImage } from './ShopCardImage';

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

const VISIBLE = 3;
const itemWidthPercent = 100 / VISIBLE;

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

export const Shop: React.FC = () => {
  const { addItem } = useCart();
  const [showAddedToast, setShowAddedToast] = useState(false);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (!supabase) {
      setItems([]);
      return;
    }
    (async () => {
      try {
        const { data: slotData, error: slotErr } = await supabase
          .from('main_layout_slots')
          .select('slot_index, title, description, image_url, product_id, link_url');
        if (slotErr) {
          console.warn('[Shop] main_layout_slots:', slotErr.message);
          setItems(FALLBACK_SHOP_ITEMS);
          return;
        }
        const slots = ((slotData ?? []) as { slot_index: number; title: string | null; description: string | null; image_url: string | null; product_id: string | null; link_url: string | null }[]).slice().sort((a, b) => a.slot_index - b.slot_index);
        if (!slots.length) {
          setItems(FALLBACK_SHOP_ITEMS);
          return;
        }

        const productIds = [...new Set(slots.map((s) => s.product_id).filter(Boolean))] as string[];
        let productsMap: Record<
          string,
          {
            rrp_price: number | null;
            prp_price: number | null;
            image_url: string | null;
            image_urls: string[];
            box_theme: 'brand' | 'sky' | null;
          }
        > = {};
        if (productIds.length > 0) {
          const { data: prodData, error: prodErr } = await supabase
            .from('products')
            .select('id, rrp_price, prp_price, image_url, image_urls, box_theme')
            .in('id', productIds);
          if (prodErr) {
            console.warn('[Shop] products:', prodErr.message);
          } else {
            (prodData ?? []).forEach((p: { id: string; rrp_price: number | null; prp_price: number | null; image_url: string | null; image_urls?: string[] | null; box_theme?: 'brand' | 'sky' | null }) => {
              productsMap[p.id] = {
                rrp_price: p.rrp_price,
                prp_price: p.prp_price,
                image_url: p.image_url ?? null,
                image_urls: Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : [],
                box_theme: p.box_theme ?? 'brand',
              };
            });
          }
        }

        const list: ShopItem[] = slots.map((s: { slot_index: number; title: string | null; image_url: string | null; product_id: string | null; link_url: string | null }) => {
          const productId = s.product_id ?? null;
          const product = productId ? productsMap[productId] : null;
          const prp = product?.prp_price != null ? Number(product.prp_price) : null;
          const rrp = product?.rrp_price != null ? Number(product.rrp_price) : null;
          const price = prp ?? rrp ?? 0;
          const originalPrice = prp != null && rrp != null ? rrp : null;

          // 슬롯에 product_id가 연결돼 있으면 **항상 products 테이블의 최신 이미지**만 사용
          const productImageUrls =
            product && Array.isArray(product.image_urls) && product.image_urls.length
              ? product.image_urls
              : product && product.image_url
              ? [product.image_url]
              : [];
          const imageUrls = productId && product ? productImageUrls : s.image_url ? [s.image_url] : [];
          const imageUrl = imageUrls[0] ?? null;
          const boxTheme: 'brand' | 'sky' | null =
            product?.box_theme ?? (s.slot_index >= 4 ? 'sky' : 'brand');
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
        setItems(list);
      } catch (e) {
        console.warn('[Shop] load error:', e);
        setItems(FALLBACK_SHOP_ITEMS);
      }
    })();
  }, []);

  useEffect(() => {
    if (!showAddedToast) return;
    const t = setTimeout(() => setShowAddedToast(false), 2500);
    return () => clearTimeout(t);
  }, [showAddedToast]);

  const maxIndex = Math.max(0, items.length - VISIBLE);
  const goPrev = () => setCarouselIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCarouselIndex((i) => Math.min(maxIndex, i + 1));

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

  const cardTop = (item: ShopItem) => (
    <>
      <p
        className={
          (item.boxTheme ?? 'brand') === 'sky'
            ? 'text-center text-sm font-medium tracking-wide text-sky-700'
            : 'text-center text-sm font-medium tracking-wide text-brand'
        }
      >
        {item.name}
      </p>
      <ShopCardImage images={item.imageUrls.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : []} name={item.name} />
      <div className="mt-4 flex flex-col items-center gap-0.5 text-center">
        {item.originalPrice != null && (
          <span className="text-sm text-slate-500 line-through">{formatPrice(item.originalPrice)}</span>
        )}
        <span className="text-base font-semibold text-slate-900">{formatPrice(item.price)}</span>
      </div>
    </>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-medium tracking-wide text-brand">Beauty Box</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Курация весна/лето 2026
        </h1>
      </header>

      {/* 캐러셀: 한 화면 3개, 모바일 터치 스와이프 / 웹 화살표 — 좌우 여백으로 화살표가 카드와 겹치지 않음 */}
      <section className="relative px-12 md:px-16">
        <div
          className="overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex transition-[transform] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
            style={{ transform: `translateX(-${carouselIndex * itemWidthPercent}%)` }}
          >
            {items.map((product) => (
              <div
                key={product.id}
                className="flex shrink-0 flex-col px-2 sm:px-3"
                style={{ width: `${itemWidthPercent}%` }}
              >
                <article
                  className={
                    (product.boxTheme ?? 'brand') === 'sky'
                      ? 'flex min-h-[420px] flex-col items-center rounded-xl border border-sky-200 bg-sky-50/60 px-4 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-6'
                      : 'flex min-h-[420px] flex-col items-center rounded-xl border border-brand/20 bg-brand-soft/25 px-4 pt-4 pb-6 sm:px-6 sm:pt-5 sm:pb-6'
                  }
                >
                  {product.linkUrl ? (
                    <a href={product.linkUrl} className="flex w-full flex-1 flex-col items-center">
                      {cardTop(product)}
                    </a>
                  ) : (
                    <Link
                      to={`/product/${product.productId ?? product.id}`}
                      className="flex w-full flex-1 flex-col items-center cursor-pointer"
                    >
                      {cardTop(product)}
                    </Link>
                  )}
                  <div className="mt-4 flex w-full flex-col items-center gap-2 sm:flex-row sm:justify-center">
                    {product.linkUrl ? (
                      <a
                        href={product.linkUrl}
                        className={
                          (product.boxTheme ?? 'brand') === 'sky'
                            ? 'w-full rounded-full border-2 border-sky-600 py-2.5 px-4 text-center text-sm font-semibold text-sky-700 transition hover:bg-sky-50 sm:w-auto'
                            : 'w-full rounded-full border-2 border-slate-300 py-2.5 px-4 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto'
                        }
                      >
                        Подробнее
                      </a>
                    ) : (
                      <Link
                        to={`/product/${product.productId ?? product.id}`}
                        className={
                          (product.boxTheme ?? 'brand') === 'sky'
                            ? 'w-full rounded-full border-2 border-sky-600 py-2.5 px-4 text-center text-sm font-semibold text-sky-700 transition hover:bg-sky-50 sm:w-auto'
                            : 'w-full rounded-full border-2 border-slate-300 py-2.5 px-4 text-center text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto'
                        }
                      >
                        Подробнее
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToCart(product);
                      }}
                      className={
                        (product.boxTheme ?? 'brand') === 'sky'
                          ? 'w-full rounded-full bg-sky-600 py-2.5 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 sm:w-auto'
                          : 'w-full rounded-full bg-brand py-2.5 px-4 text-sm font-semibold text-white transition hover:bg-brand/90 sm:w-auto'
                      }
                    >
                      В корзину
                    </button>
                  </div>
                </article>
              </div>
            ))}
          </div>
        </div>

        {items.length > VISIBLE && (
          <>
            <button
              type="button"
              onClick={goPrev}
              disabled={carouselIndex === 0}
              className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30 md:flex md:items-center md:justify-center"
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
              className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30 md:flex md:items-center md:justify-center"
              aria-label="Следующие"
            >
              <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}

        {items.length > VISIBLE && (
          <div className="mt-4 flex justify-center gap-2">
            {Array.from({ length: maxIndex + 1 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCarouselIndex(i)}
                className={`h-2 rounded-full transition ${
                  i === carouselIndex ? 'w-6 bg-brand' : 'w-2 bg-slate-200'
                }`}
                aria-label={`Слайд ${i + 1}`}
              />
            ))}
          </div>
        )}
      </section>

      {showAddedToast && (
        <div
          className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6"
          role="status"
          aria-live="polite"
        >
          Добавлено в корзину
        </div>
      )}
    </main>
  );
};
