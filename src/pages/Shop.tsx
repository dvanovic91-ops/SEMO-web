import React, { useState, useEffect } from 'react';
import { useCart } from '../context/CartContext';

/** 뷰티박스 상품 — 타입 1~4(주황 박스), Family care(연하늘 박스), 장바구니 연동 */
const BEAUTY_BOX_PRODUCTS = [
  { id: 'beauty-box-type-1', name: 'Тип 1', price: 11000, originalPrice: 12000, imageLabel: 'Тип 1', isFamily: false },
  { id: 'beauty-box-type-2', name: 'Тип 2', price: 11000, originalPrice: 12000, imageLabel: 'Тип 2', isFamily: false },
  { id: 'beauty-box-type-3', name: 'Тип 3', price: 11000, originalPrice: 12000, imageLabel: 'Тип 3', isFamily: false },
  { id: 'beauty-box-type-4', name: 'Тип 4', price: 11000, originalPrice: 12000, imageLabel: 'Тип 4', isFamily: false },
  { id: 'beauty-box-family', name: 'Family care', price: 13000, originalPrice: 14000, imageLabel: 'Family care', isFamily: true },
];

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

export const Shop: React.FC = () => {
  const { addItem } = useCart();
  const [showAddedToast, setShowAddedToast] = useState(false);

  useEffect(() => {
    if (!showAddedToast) return;
    const t = setTimeout(() => setShowAddedToast(false), 2500);
    return () => clearTimeout(t);
  }, [showAddedToast]);

  const handleAddToCart = (product: (typeof BEAUTY_BOX_PRODUCTS)[0]) => {
    addItem({ id: product.id, name: product.name, price: product.price });
    setShowAddedToast(true);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {/* 상단: 2026 봄/여름 큐레이션 */}
      <header className="mb-10">
        <p className="text-sm font-medium tracking-wide text-brand">
          Beauty Box
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Курация весна/лето 2026
        </h1>
      </header>

      {/* Тип 1, 2, 3, 4 + Family care — 결과지 SEMO 박스 스타일(주황) / 패밀리만 연하늘 */}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {BEAUTY_BOX_PRODUCTS.map((product) => (
          <article
            key={product.id}
            className={
              product.isFamily
                ? 'rounded-xl border border-sky-200 bg-sky-50/60 py-6 px-6'
                : 'rounded-xl border border-brand/20 bg-brand-soft/25 py-6 px-6'
            }
          >
            <p
              className={
                product.isFamily
                  ? 'text-sm font-medium tracking-wide text-sky-700'
                  : 'text-sm font-medium tracking-wide text-brand'
              }
            >
              {product.name}
            </p>
            {/* 네모 박스 placeholder 이미지 */}
            <div
              className="mt-4 aspect-square w-full overflow-hidden rounded-lg bg-white/80 flex items-center justify-center border border-slate-200/80"
              style={{ minHeight: '180px' }}
            >
              <span
                className={
                  product.isFamily
                    ? 'text-base font-medium text-sky-600'
                    : 'text-base font-medium text-brand'
                }
              >
                {product.imageLabel}
              </span>
            </div>
            {/* 단가: 원가 취소선 + 할인가 */}
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-sm text-slate-500 line-through">
                {formatPrice(product.originalPrice)}
              </span>
              <span className="text-base font-semibold text-slate-900">
                {formatPrice(product.price)}
              </span>
            </div>
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
        ))}
      </section>

      {/* 장바구니 추가 시 안내 — 모바일에서는 하단 바 위에 표시 */}
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
