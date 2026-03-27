import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { AuthInitializingScreen, SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
import {
  carrierLabelRu,
  fulfillmentEventsSortedNewestFirst,
  parseFulfillmentTracking,
  resolveTrackingUrl,
  type FulfillmentTracking,
} from '../../lib/fulfillmentTracking';
import { normalizeOrderStatus, ORDER_STATUS_LABEL_RU, type OrderShipmentStatus } from '../../lib/orderStatusRu';
import { supabase } from '../../lib/supabase';

export type OrderItem = { id: string; name: string; quantity: number; price: number };
export interface Order {
  id: string;
  /** 고객 노출용 주문번호 (알파벳 1자 + 숫자 6자). 없으면 id 앞 8자 폴백 */
  order_number?: string | null;
  date: string;
  total: number;
  /** 결제·배송 단계: pending → completed → product_preparing → shipping_soon → shipped → delivered/confirmed */
  status: OrderShipmentStatus;
  items: OrderItem[];
  /** SDEK/우체국 등 배송 추적 URL(legacy). `fulfillment_tracking.tracking_url` 우선 */
  tracking_url?: string | null;
  /** СДЭК / Почта — события и трек-номер (orders.fulfillment_tracking) */
  fulfillmentTracking?: FulfillmentTracking | null;
  /** 결제 시점 스냅샷. 고객이 배송 전에 수정 가능 */
  receiver_name?: string | null;
  receiver_phone?: string | null;
  shipping_address?: string | null;
  /** 테스트 주문 여부 (가짜 결제 ?test=1). 목록에는 그대로 노출 */
  is_test?: boolean;
}

type DbOrder = {
  id: string;
  order_number?: string | null;
  created_at?: string;
  total_cents?: number;
  status?: string;
  items?: OrderItem[];
  tracking_url?: string | null;
  fulfillment_tracking?: unknown;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  shipping_address?: string | null;
  is_test?: boolean;
};

/** 배송 전 상태만 수령인 정보 수정 가능 (발송 중 이전) */
const canEditShipping = (status: Order['status']) =>
  ['pending', 'completed', 'product_preparing', 'shipping_soon'].includes(status);

export const ProfileOrders: React.FC = () => {
  const { isLoggedIn, initialized, userId } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightOrderId = searchParams.get('order');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  /** 수정 중인 주문 id. 설정 시 해당 카드에 인라인 수정 폼 표시 */
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ receiver_name: '', receiver_phone: '', shipping_address: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !userId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const mapRows = (rows: DbOrder[] | null): Order[] =>
      (rows ?? []).map((row: DbOrder) => {
        const ft = parseFulfillmentTracking(row.fulfillment_tracking);
        return {
          id: row.id,
          order_number: row.order_number ?? null,
          date: row.created_at ? new Date(row.created_at).toLocaleDateString('en-US') : '',
          total: (row.total_cents ?? 0) / 100,
          status: normalizeOrderStatus(row.status),
          items: Array.isArray(row.items) ? row.items : [],
          receiver_name: row.receiver_name ?? null,
          receiver_phone: row.receiver_phone ?? null,
          shipping_address: row.shipping_address ?? null,
          tracking_url: row.tracking_url ?? null,
          fulfillmentTracking: ft,
          is_test: row.is_test ?? false,
        };
      });

    supabase
      .from('orders')
      .select(
        'id, order_number, created_at, total_cents, status, items, receiver_name, receiver_phone, shipping_address, tracking_url, fulfillment_tracking, is_test',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[ProfileOrders] select error (retry without fulfillment_tracking):', error.message);
          supabase
            .from('orders')
            .select(
              'id, order_number, created_at, total_cents, status, items, receiver_name, receiver_phone, shipping_address, tracking_url, is_test',
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .then(({ data: data2, error: err2 }) => {
              if (err2) {
                console.warn('[ProfileOrders] retry minimal:', err2.message);
                supabase
                  .from('orders')
                  .select('id, created_at, total_cents, status, receiver_name, receiver_phone, shipping_address')
                  .eq('user_id', userId)
                  .order('created_at', { ascending: false })
                  .then(({ data: data3, error: err3 }) => {
                    if (err3) {
                      console.warn('[ProfileOrders] retry error:', err3.message);
                      setOrders([]);
                    } else {
                      setOrders(mapRows(data3 as DbOrder[]));
                    }
                  });
                return;
              }
              setOrders(mapRows(data2 as DbOrder[]));
            });
          return;
        }
        setOrders(mapRows(data as DbOrder[]));
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [userId]);

  /** 알림에서 ?order=uuid 로 진입 시 해당 카드로 스크롤 */
  useEffect(() => {
    if (!highlightOrderId || loading) return;
    const id = `order-card-${highlightOrderId}`;
    const t = window.setTimeout(() => {
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.add('ring-2', 'ring-brand/40');
        window.setTimeout(() => el.classList.remove('ring-2', 'ring-brand/40'), 2400);
      }
    }, 100);
    return () => window.clearTimeout(t);
  }, [highlightOrderId, loading, orders]);

  if (!initialized) return <AuthInitializingScreen />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  /** 상태별 뱃지 스타일 (고객 화면용) */
  const statusBadgeClass: Record<Order['status'], string> = {
    pending: 'bg-amber-100 text-amber-800',
    completed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-rose-100 text-rose-800',
    canceled: 'bg-slate-200 text-slate-600',
    product_preparing: 'bg-blue-100 text-blue-800',
    shipping_soon: 'bg-indigo-100 text-indigo-800',
    shipped: 'bg-sky-100 text-sky-800',
    delivered: 'bg-violet-100 text-violet-800',
    confirmed: 'bg-emerald-100 text-emerald-800',
  };

  /** 주문 문의용 텔레그램 링크 (start 파라미터로 주문번호 전달 → 봇에서 어떤 주문 문의인지 식별) */
  const TELEGRAM_BOT_URL = import.meta.env.VITE_TELEGRAM_BOT_URL ?? 'https://t.me/My_SEMO_Beautybot';

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-[length:calc(0.875rem-1pt)] font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-[length:calc(1.25rem-1pt)] font-semibold tracking-tight text-slate-900 sm:text-[length:calc(1.5rem-1pt)]">
          Order history
        </h1>
        <p className="mt-1 text-[length:calc(0.875rem-1pt)] text-slate-500">
          Orders and delivery tracking
        </p>
      </header>

      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : orders.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">
          No orders yet.
        </p>
      ) : (
      <ul className="space-y-5">
        {orders.map((order) => (
          <li
            key={order.id}
            id={`order-card-${order.id}`}
            className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${order.is_test ? 'ring-1 ring-amber-200 bg-amber-50/30' : ''}`}
          >
            {/* 상단: 주문번호 + 날짜 + 테스트 뱃지 */}
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[length:calc(1rem-1pt)] font-semibold tracking-tight text-slate-900">
                  Order # {order.order_number ?? order.id.slice(0, 8)}
                </p>
                <div className="flex items-center gap-2">
                  {order.is_test && (
                    <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-medium text-amber-900">Test</span>
                  )}
                  <span className="text-[length:calc(0.875rem-1pt)] text-slate-500">{order.date}</span>
                </div>
              </div>
            </div>

            {/* 주문 상태·금액 */}
            <div className="px-5 py-3 sm:px-6 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass[order.status]}`}>
                {ORDER_STATUS_LABEL_RU[order.status]}
              </span>
              <span className="text-[length:calc(0.875rem-1pt)] font-semibold text-slate-900 tabular-nums">
                {order.total.toLocaleString('en-US')} ₽
              </span>
            </div>

            {/* 수령인 정보 */}
            {(order.receiver_name || order.receiver_phone || order.shipping_address) && (
              <div className="px-5 py-3 sm:px-6 bg-slate-50/40">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Recipient</p>
                <dl className="space-y-1 text-[length:calc(0.875rem-1pt)] text-slate-700">
                  {order.receiver_name && (
                    <div><dt className="sr-only">Full name</dt><dd>{order.receiver_name}</dd></div>
                  )}
                  {order.receiver_phone && (
                    <div><dt className="sr-only">Phone</dt><dd className="tabular-nums">{order.receiver_phone}</dd></div>
                  )}
                  {order.shipping_address && (
                    <div><dt className="sr-only">Address</dt><dd className="mt-1 break-words text-slate-600">{order.shipping_address}</dd></div>
                  )}
                </dl>
              </div>
            )}

            {/* События доставки (API СДЭК/Почты → fulfillment_tracking.events) */}
            {(() => {
              const ft = order.fulfillmentTracking;
              const evs = fulfillmentEventsSortedNewestFirst(ft, 6);
              const carrierRu = carrierLabelRu(ft?.carrier ?? null);
              if (!ft?.tracking_number && evs.length === 0 && !carrierRu) return null;
              return (
                <div className="border-b border-slate-100 px-5 py-3 sm:px-6">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Delivery</p>
                  {carrierRu && (
                    <p className="mt-1 text-[length:calc(0.875rem-1pt)] text-slate-700">
                      Carrier: <span className="font-medium">{carrierRu}</span>
                    </p>
                  )}
                  {ft?.tracking_number?.trim() && (
                    <p className="mt-1 text-[length:calc(0.875rem-1pt)] text-slate-700 tabular-nums">
                      Tracking number: {ft.tracking_number.trim()}
                    </p>
                  )}
                  {evs.length > 0 && (
                    <ul className="mt-2 space-y-1.5 text-[length:calc(0.875rem-1pt)] text-slate-600">
                      {evs.map((ev, idx) => (
                        <li key={`${ev.at}-${idx}`}>
                          {ev.at ? new Date(ev.at).toLocaleString('en-US') : ''} — {ev.label_ru}
                          {ev.location ? <span className="text-slate-500"> · {ev.location}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* 배송 추적 링к (fulfillment_tracking.tracking_url ?? legacy tracking_url) */}
            {['shipped', 'delivered', 'confirmed'].includes(order.status) &&
              resolveTrackingUrl(order.fulfillmentTracking ?? null, order.tracking_url) && (
                <div className="px-5 py-3 sm:px-6 border-b border-slate-100">
                  <a
                    href={resolveTrackingUrl(order.fulfillmentTracking ?? null, order.tracking_url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-[length:calc(0.875rem-1pt)] font-medium text-brand hover:underline"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Track delivery
                  </a>
                </div>
              )}

            {/* 하단: 배송 정보 수정 + 해당 주문 문의하기(텔레그램) */}
            <div className="px-5 py-3 sm:px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
              {canEditShipping(order.status) && editingOrderId !== order.id && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingOrderId(order.id);
                    setEditForm({
                      receiver_name: order.receiver_name ?? '',
                      receiver_phone: order.receiver_phone ?? '',
                      shipping_address: order.shipping_address ?? '',
                    });
                  }}
                  className="text-[length:calc(0.875rem-1pt)] font-medium text-brand hover:underline"
                >
                  Edit delivery details
                </button>
              )}
              </div>
              <a
                href={`${TELEGRAM_BOT_URL}?start=order_${encodeURIComponent(order.order_number ?? order.id.slice(0, 8))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand-soft/40 px-4 py-2.5 text-[length:calc(0.875rem-1pt)] font-medium text-brand transition hover:bg-brand-soft/60"
              >
                <svg className="h-5 w-5 shrink-0 text-[#26A5E4]" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
                Order support
              </a>
            </div>
            {editingOrderId === order.id && (
              <div className="px-5 py-3 sm:px-6">
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                <p className="mb-2 text-[length:calc(0.75rem-1pt)] font-medium text-slate-600">Full name, phone, address</p>
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Recipient full name"
                    value={editForm.receiver_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, receiver_name: e.target.value }))}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-[length:calc(0.875rem-1pt)]"
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={editForm.receiver_phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, receiver_phone: e.target.value }))}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-[length:calc(0.875rem-1pt)]"
                  />
                  <textarea
                    rows={2}
                    placeholder="Delivery address"
                    value={editForm.shipping_address}
                    onChange={(e) => setEditForm((f) => ({ ...f, shipping_address: e.target.value }))}
                    className="w-full rounded border border-slate-200 px-3 py-2 text-[length:calc(0.875rem-1pt)]"
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      if (!supabase || !userId || saving) return;
                      setSaving(true);
                      try {
                        const { error } = await supabase
                          .from('orders')
                          .update({
                            receiver_name: editForm.receiver_name.trim() || null,
                            receiver_phone: editForm.receiver_phone.trim() || null,
                            shipping_address: editForm.shipping_address.trim() || null,
                          })
                          .eq('id', order.id)
                          .eq('user_id', userId);
                        if (error) throw error;
                        setOrders((prev) =>
                          prev.map((o) =>
                            o.id === order.id
                              ? {
                                  ...o,
                                  receiver_name: editForm.receiver_name.trim() || null,
                                  receiver_phone: editForm.receiver_phone.trim() || null,
                                  shipping_address: editForm.shipping_address.trim() || null,
                                }
                              : o
                          )
                        );
                        setEditingOrderId(null);
                      } catch (e) {
                        window.alert(e instanceof Error ? e.message : 'Failed to save');
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="rounded-full bg-brand px-4 py-1.5 text-[length:calc(0.875rem-1pt)] font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingOrderId(null)}
                    className="rounded-full border border-slate-200 px-4 py-1.5 text-[length:calc(0.875rem-1pt)] text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      )}
    </main>
  );
};
