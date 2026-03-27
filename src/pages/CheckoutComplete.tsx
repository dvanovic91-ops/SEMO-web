import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useI18n } from '../context/I18nContext';
import { formatCurrencyAmount } from '../lib/market';

/** 결제 완료 페이지 — Checkout에서 state·쿼리로 금액/수량/주문번호 전달. 새로고침 시 state는 사라지므로 쿼리 orderId로 주문번호 복구. */
export const CheckoutComplete: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { clearCart } = useCart();
  const { language, currency } = useI18n();
  const state = (location.state as { total?: number; totalCount?: number; pointsUsed?: number; orderId?: string | null; orderNumber?: string | null } | null) ?? {};
  const total = state.total ?? 0;
  const totalCount = state.totalCount ?? 0;
  const pointsUsed = state.pointsUsed ?? 0;
  const orderIdFromState = state.orderId ?? null;
  const orderNumberFromState = state.orderNumber ?? null;
  const orderNumberFromQuery = searchParams.get('orderNumber');
  const orderId = orderIdFromState ?? null;
  const orderNumber = orderNumberFromState ?? orderNumberFromQuery ?? (orderId ? orderId.slice(0, 8) : null);
  const clearedRef = useRef(false);
  const [showToast, setShowToast] = useState(!!orderNumber || !!orderId);
  const tt = {
    completed: language === 'en' ? 'Order placed' : 'Заказ оформлен',
    desc:
      language === 'en'
        ? 'We will send a delivery notification soon. If you have questions, contact our Telegram bot.'
        : 'В ближайшее время отправим вам уведомление о доставке. Если появятся вопросы — обращайтесь в наш Telegram-бот.',
    orderNo: language === 'en' ? 'Order #' : 'Заказ №',
    items: language === 'en' ? 'Items:' : 'Оформлено товаров:',
    total: language === 'en' ? 'total' : 'на сумму',
    points: language === 'en' ? 'points used' : 'баллами',
    orders: language === 'en' ? 'Order history' : 'История заказов',
    back: language === 'en' ? 'Back to catalog' : 'Вернуться в каталог',
  };

  useEffect(() => {
    if ((orderId || orderNumber) && !clearedRef.current) {
      clearedRef.current = true;
      clearCart();
    }
  }, [orderId, orderNumber, clearCart]);

  useEffect(() => {
    if (!showToast) return;
    const t = setTimeout(() => setShowToast(false), 3000);
    return () => clearTimeout(t);
  }, [showToast]);

  return (
    <>
      {showToast && (
        <div
          className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {tt.completed}
        </div>
      )}
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-4 py-16 sm:py-24">
      <div className="flex flex-col items-center text-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-brand/10">
          <svg
            className="h-8 w-8 text-brand"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {tt.completed}
        </h1>
        <p className="mt-3 text-slate-600">
          {tt.desc}
        </p>
        {orderNumber && (
          <p className="mt-2 text-sm font-medium text-slate-700">
            {tt.orderNo} {orderNumber}
          </p>
        )}
        {(totalCount > 0 || total > 0) && (
          <p className="mt-1 text-sm text-slate-500">
            {tt.items} {totalCount} {tt.total} {formatCurrencyAmount(total, currency)}.
            {pointsUsed > 0 && ` (${tt.points}: −${pointsUsed})`}
          </p>
        )}
      </div>

      <nav className="mt-10 flex flex-wrap justify-center gap-4">
        <Link
          to="/profile/orders"
          className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-white px-6 py-3 text-sm font-medium text-brand hover:bg-brand-soft/20"
        >
          {tt.orders}
        </Link>
        <Link
          to="/shop"
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-6 py-3 text-sm font-medium text-white hover:bg-brand/90"
        >
          {tt.back}
        </Link>
      </nav>
    </main>
    </>
  );
};
