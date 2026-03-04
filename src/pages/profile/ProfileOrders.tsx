import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { useAuth } from '../../context/AuthContext';
import { USE_MOCK_ORDERS, mockOrders } from '../../data/mocks';

/**
 * 주문 내역 — 타입은 mocks와 동일하게 유지. API 연동 시 Order[]만 교체.
 */
export type OrderItem = { id: string; name: string; quantity: number; price: number };
export type ShipmentTracking = { status: string; message: string; date?: string };
export interface Order {
  id: string;
  date: string;
  total: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  items: OrderItem[];
  tracking?: ShipmentTracking[];
}

const statusLabel: Record<Order['status'], string> = {
  pending: 'Ожидает оплаты',
  paid: 'Оплачен',
  shipped: 'Отправлен',
  delivered: 'Доставлен',
  cancelled: 'Отменён',
};

export const ProfileOrders: React.FC = () => {
  const { isLoggedIn, initialized } = useAuth();
  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><BackArrow /> Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          История заказов
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Заказы и отслеживание доставки (структура готова для API)
        </p>
      </header>

      <ul className="space-y-4">
        {(USE_MOCK_ORDERS ? mockOrders : []).map((order) => (
          <li key={order.id} className="rounded-xl border border-slate-100 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-slate-800">{order.id}</p>
              <span className="text-sm text-slate-500">{order.date}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {statusLabel[order.status]} · {order.total.toLocaleString('ru-RU')} ₽
            </p>
            {order.tracking && order.tracking.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium text-slate-500">Отслеживание</p>
                <ul className="mt-1 space-y-1 text-sm text-slate-600">
                  {order.tracking.map((t, i) => (
                    <li key={i}>{t.date} — {t.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
};
