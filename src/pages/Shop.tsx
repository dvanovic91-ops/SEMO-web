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
  isFamily?: boolean;
};

/** 폴백: DB 슬롯 없을 때 사용 */
const FALLBACK_ITEMS: ShopItem[] = [
  { id: 'type-1', name: 'Тип 1', price: 11000, originalPrice: 12000, imageUrl: null, imageUrls: [], productId: null, linkUrl: null, isFamily: false },
  { id: 'type-2', name: 'Тип 2', price: 11000, originalPrice: 12000, imageUrl: null, imageUrls: [], productId: null, linkUrl: null, isFamily: false },
  { id: 'type-3', name: 'Тип 3', price: 11000, originalPrice: 12000, imageUrl: null, imageUrls: [], productId: null, linkUrl: null, isFamily: false },
  { id: 'type-4', name: 'Тип 4', price: 11000, originalPrice: 12000, imageUrl: null, imageUrls: [], productId: null, linkUrl: null, isFamily: false },
  { id: 'family', name: 'Family care', price: 13000, originalPrice: 14000, imageUrl: null, imageUrls: [], productId: null, linkUrl: null, isFamily: true },
];

const VISIBLE = 3;
const itemWidthPercent = 100 / VISIBLE;

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

export const Shop: React.FC = () => {
  const { addItem } = useCart();
  const [showAddedToast, setShowAddedToast] = useState(false);
  const [items, setItems] = useState<ShopItem[]>(FALLBACK_ITEMS);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      const { data: slotData } = await supabase
        .from('main_layout_slots')
        .select('slot_index, title, description, image_url, product_id, link_url')
        .order('slot_index');
      if (!slotData?.length) return;

      const productIds = [...new Set((slotData as { product_id: string | null }[]).map((s) => s.product_id).filter(Boolean))] as string[];
      let productsMap: Record<string, { rrp_price: number | null; prp_price: number | null; image_url: string | null; image_urls: string[] }> = {};
      if (productIds.length > 0) {
        const { data: prodData } = await supabase
          .from('products')
          .select('id, rrp_price, prp_price, image_url, image_urls')
          .in('id', productIds);
        (prodData ?? []).forEach((p: { id: string; rrp_price: number | null; prp_price: number | null; image_url: string | null; image_urls?: string[] | null }) => {
          productsMap[p.id] = {
            rrp_price: p.rrp_price,
            prp_price: p.prp_price,
            image_url: p.image_url ?? null,
            image_urls: Array.isArray(p.image_urls) ? p.image_urls : [],
          };
        });
      }

      const list: ShopItem[] = slotData.map((s: { slot_index: number; title: string | null; image_url: string | null; product_id: string | null; link_url: string | null }) => {
        const productId = s.product_id ?? null;
        const product = productId ? productsMap[productId] : null;
        const prp = product?.prp_price != null ? Number(product.prp_price) : null;
        const rrp = product?.rrp_price != null ? Number(product.rrp_price) : null;
        const price = prp ?? rrp ?? 0;
        const originalPrice = prp != null && rrp != null ? rrp : null;
        const imageUrl = (productId && product?.image_url) ? product.image_url : (s.image_url ?? null);
        const imageUrls =
          (productId && product?.image_urls && product.image_urls.length
            ? product.image_urls
            : imageUrl
            ? [imageUrl]
            : []) ?? [];
        return {
          id: productId ?? `slot-${s.slot_index}`,
          name: s.title ?? `Слот ${s.slot_index + 1}`,
          price,
          originalPrice,
          imageUrl,
          imageUrls,
          productId,
          linkUrl: s.link_url ?? null,
          isFamily: s.slot_index >= 4,
        };
      });
      if (list.length >= 3) setItems(list);
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
    addItem({ id: item.id, name: item.name, price: item.price });
    setShowAddedToast(true);
  };

  const cardTop = (item: ShopItem) => (
    <>
      <p className={item.isFamily ? 'text-sm font-medium tracking-wide text-sky-700' : 'text-sm font-medium tracking-wide text-brand'}>
        {item.name}
      </p>
      <ShopCardImage images={item.imageUrls.length ? item.imageUrls : item.imageUrl ? [item.imageUrl] : []} name={item.name} />
      <div className="mt-4 flex items-baseline gap-2">
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
                    product.isFamily
                      ? 'flex h-full flex-col rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-6 sm:px-6'
                      : 'flex h-full flex-col rounded-xl border border-brand/20 bg-brand-soft/25 px-4 py-6 sm:px-6'
                  }
                >
                  {product.productId ? (
                    <Link to={`/product/${product.productId}`} className="flex flex-1 flex-col">
                      {cardTop(product)}
                    </Link>
                  ) : product.linkUrl ? (
                    <a href={product.linkUrl} className="flex flex-1 flex-col">
                      {cardTop(product)}
                    </a>
                  ) : (
                    <Link to={`/product/${product.id}`} className="flex flex-1 flex-col">
                      {cardTop(product)}
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAddToCart(product)}
                    className={
                      product.isFamily
                        ? 'mt-4 w-full rounded-full bg-sky-600 py-3 text-sm font-semibold text-white transition hover:bg-sky-700'
                        : 'mt-4 w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand/90'
                    }
                  >
                    В корзину
                  </button>
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
