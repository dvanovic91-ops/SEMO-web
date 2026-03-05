import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

export const Cart: React.FC = () => {
  const { userId } = useAuth();
  const { items, updateQuantity, removeItem, total } = useCart();
  const lastSavedRef = useRef<string>('');

  // 로그인 사용자: 장바구니에 품목이 있으면 스냅샷 저장 (이탈 명단/CRM용)
  useEffect(() => {
    if (!supabase || !userId || items.length === 0) return;
    const snapshot = JSON.stringify({ items, totalCents: Math.round(total * 100) });
    if (snapshot === lastSavedRef.current) return;
    lastSavedRef.current = snapshot;
    const payload = {
      user_id: userId,
      items: items.map((i) => ({ id: i.id, name: i.name, quantity: i.quantity, price: i.price })),
      total_cents: Math.round(total * 100),
      updated_at: new Date().toISOString(),
    };
    supabase
      .from('cart_snapshots')
      .upsert(payload, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.warn('[Cart] cart_snapshots upsert:', error.message); });
  }, [userId, items, total]);

  const originalTotal = items.reduce(
    (sum, it) => sum + (it.originalPrice != null && it.originalPrice > 0 ? it.originalPrice * it.quantity : it.price * it.quantity),
    0
  );
  const paymentTotal = total;
  const benefitAmount = originalTotal - paymentTotal;

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-2xl font-semibold text-slate-900">Корзина</h1>
        <p className="mt-4 text-slate-600">Корзина пуста.</p>
        <Link to="/shop" className="mt-6 inline-block text-brand hover:underline">
          Перейти в магазин
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-semibold text-slate-900">Корзина</h1>
      <ul className="mt-8 space-y-6">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-xl border border-slate-100 bg-white p-4 sm:gap-4"
          >
            <div className="flex h-14 w-14 overflow-hidden rounded-full border border-slate-200 bg-slate-50">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs text-slate-400">Слот</span>
              )}
            </div>
            <p className="min-w-0 truncate font-medium text-slate-900">{item.name}</p>
            <div className="flex items-center gap-1.5 text-sm tabular-nums">
              {item.originalPrice != null && item.originalPrice > 0 && (
                <span className="text-slate-500 line-through">{formatPrice(item.originalPrice * item.quantity)}</span>
              )}
              <span className="font-semibold text-slate-900">{formatPrice(item.price * item.quantity)}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand hover:text-brand"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center font-medium tabular-nums">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand hover:text-brand"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500"
              aria-label="Удалить"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-10 border-t border-slate-200 pt-6">
        <div className="space-y-2 text-sm">
          {originalTotal > paymentTotal && (
            <div className="flex justify-between text-slate-500">
              <span className="font-medium">Исходная сумма</span>
              <span className="tabular-nums line-through">{formatPrice(originalTotal)}</span>
            </div>
          )}
          {benefitAmount > 0 && (
            <div className="flex justify-between font-medium text-brand">
              <span>Скидка</span>
              <span className="tabular-nums">−{formatPrice(benefitAmount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-semibold text-slate-900">
            <span>Итого к оплате</span>
            <span className="tabular-nums">{formatPrice(paymentTotal)}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 justify-center gap-4 sm:max-w-md sm:mx-auto">
        <Link
          to="/shop"
          className="rounded-full border border-slate-200 px-6 py-3 text-center text-sm font-medium text-slate-700 hover:border-brand hover:text-brand"
        >
          Продолжить покупки
        </Link>
        <Link
          to="/checkout"
          className="rounded-full bg-brand px-6 py-3 text-center text-sm font-semibold text-white hover:bg-brand/90"
        >
          Оформить заказ
        </Link>
      </div>
    </main>
  );
};
