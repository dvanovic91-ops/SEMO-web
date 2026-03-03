import React from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';

export const Cart: React.FC = () => {
  const { items, updateQuantity, removeItem, total } = useCart();

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-2xl font-semibold text-slate-900">Корзина</h1>
        <p className="mt-4 text-slate-600">Корзина пуста.</p>
        <Link
          to="/shop"
          className="mt-6 inline-block text-brand hover:underline"
        >
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
            className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white p-4"
          >
            <div>
              <p className="font-medium text-slate-900">{item.name}</p>
              <p className="text-sm text-slate-500">
                {item.price.toLocaleString('ru-RU')} ₽
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand hover:text-brand"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center font-medium tabular-nums">
                {item.quantity}
              </span>
              <button
                type="button"
                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-brand hover:text-brand"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">
                {(item.price * item.quantity).toLocaleString('ru-RU')} ₽
              </span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="text-sm text-slate-400 hover:text-red-500"
                aria-label="Удалить"
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-10 border-t border-slate-100 pt-6">
        <p className="flex justify-between text-lg font-semibold text-slate-900">
          Итого: <span>{total.toLocaleString('ru-RU')} ₽</span>
        </p>
      </div>
      <div className="mt-8 flex gap-4">
        <Link
          to="/shop"
          className="rounded-full border border-slate-200 px-6 py-3 text-center text-sm font-medium text-slate-700 hover:border-brand hover:text-brand"
        >
          Продолжить покупки
        </Link>
        <button
          type="button"
          className="rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand/90"
        >
          Оформить заказ
        </button>
      </div>
    </main>
  );
};
