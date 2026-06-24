import React, { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { AuthInitializingScreen, SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import {
  carrierLabelRu,
  fulfillmentEventsSortedNewestFirst,
  parseFulfillmentTracking,
  resolveTrackingUrl,
  type FulfillmentTracking,
} from '../../lib/fulfillmentTracking';
import { normalizeOrderStatus, ORDER_STATUS_LABEL_RU, type OrderShipmentStatus } from '../../lib/orderStatusRu';
import { resolveSkuStorefrontName } from '../../lib/skuStorefrontTitle';
import { supabase } from '../../lib/supabase';

export type OrderItem = { id: string; name: string; quantity: number; price: number };
export interface Order {
  id: string;
  /** 고객 노출용 주문번호 (알파벳 1자 + 숫자 6자). 없으면 id 앞 8자 폴백 */
  order_number?: string | null;
  date: string;
  created_at?: string | null;
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
  recommendation_snapshot_id?: string | null;
  /** 주문 타입: 'box'(기본) | 'gift_voucher' */
  order_type?: string | null;
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
  recommendation_snapshot_id?: string | null;
  order_type?: string | null;
};

type RecommendationFeedbackRow = {
  id: string;
  order_id: string | null;
  overall_rating: number | null;
  skin_fit_rating: number | null;
  irritation_reported: boolean | null;
  repurchase_intent: boolean | null;
  comment: string | null;
  component_feedback?: ComponentFeedback | null;
  reward_points?: number | null;
  rewarded_at?: string | null;
};

type ComponentFeedback = {
  favorite_item_id?: string | null;
  disliked_item_id?: string | null;
  irritated_item_id?: string | null;
  repurchase_item_id?: string | null;
};

type FeedbackDraft = {
  overall: string;
  skinFit: string;
  irritation: string;
  repurchase: string;
  favoriteItemId: string;
  dislikedItemId: string;
  irritatedItemId: string;
  repurchaseItemId: string;
  comment: string;
};

type FeedbackItemOption = {
  id: string;
  name: string;
  productType?: string | null;
};

type ProductComponentOptionRow = {
  product_id: string;
  sort_order?: number | null;
  name?: string | null;
  sku_id?: string | null;
  sku_items?: {
    display_name?: string | null;
    name?: string | null;
    name_en?: string | null;
    product_type?: string | null;
    brand?: string | null;
  } | null;
};

const emptyFeedbackDraft = (): FeedbackDraft => ({
  overall: '5',
  skinFit: '5',
  irritation: 'no',
  repurchase: 'yes',
  favoriteItemId: '',
  dislikedItemId: '',
  irritatedItemId: '',
  repurchaseItemId: '',
  comment: '',
});

const FEEDBACK_REWARD_POINTS = 500;
const FEEDBACK_MIN_COMMENT_CHARS = 30;
const FEEDBACK_ELIGIBLE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

function dedupeFeedbackOptions(items: FeedbackItemOption[]): FeedbackItemOption[] {
  const seen = new Set<string>();
  const out: FeedbackItemOption[] = [];
  items.forEach((item) => {
    const key = item.id || item.name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(item);
  });
  return out;
}

function normalizeProductTypeKey(productType: string | null | undefined): string {
  return String(productType ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');
}

function formatFeedbackProductType(productType: string | null | undefined, isEn: boolean): string | null {
  const key = normalizeProductTypeKey(productType);
  if (!key) return null;
  const labels: Record<string, { en: string; ru: string }> = {
    cleanser: { en: 'Cleanser', ru: 'Очищение' },
    'cleansing foam': { en: 'Cleanser', ru: 'Очищение' },
    'cleansing oil': { en: 'Cleansing oil', ru: 'Гидрофильное масло' },
    toner: { en: 'Toner', ru: 'Тонер' },
    ampoule: { en: 'Ampoule', ru: 'Ампула' },
    serum: { en: 'Serum', ru: 'Сыворотка' },
    essence: { en: 'Essence', ru: 'Эссенция' },
    cream: { en: 'Cream', ru: 'Крем' },
    moisturizer: { en: 'Cream', ru: 'Крем' },
    sunscreen: { en: 'Sunscreen', ru: 'Солнцезащита' },
    suncream: { en: 'Sunscreen', ru: 'Солнцезащита' },
    mask: { en: 'Mask', ru: 'Маска' },
    'sheet mask': { en: 'Sheet mask', ru: 'Тканевая маска' },
    eyecream: { en: 'Eye cream', ru: 'Крем для глаз' },
    'eye cream': { en: 'Eye cream', ru: 'Крем для глаз' },
    클렌저: { en: 'Cleanser', ru: 'Очищение' },
    토너: { en: 'Toner', ru: 'Тонер' },
    앰플: { en: 'Ampoule', ru: 'Ампула' },
    세럼: { en: 'Serum', ru: 'Сыворотка' },
    에센스: { en: 'Essence', ru: 'Эссенция' },
    크림: { en: 'Cream', ru: 'Крем' },
    선크림: { en: 'Sunscreen', ru: 'Солнцезащита' },
    마스크: { en: 'Mask', ru: 'Маска' },
  };
  const label = labels[key];
  if (label) return isEn ? label.en : label.ru;
  return productType ?? null;
}

function compactCommentLength(comment: string): number {
  return comment.replace(/\s/g, '').length;
}

function isLowQualityComment(comment: string): boolean {
  const compact = comment.replace(/\s/g, '').toLowerCase();
  if (compact.length < FEEDBACK_MIN_COMMENT_CHARS) return true;
  const uniqueChars = new Set([...compact]);
  if (uniqueChars.size <= 2) return true;
  return /(.)\1{9,}/.test(compact);
}

function isFeedbackEligible(order: Order): boolean {
  if (!['delivered', 'confirmed'].includes(order.status)) return false;
  const createdAt = order.created_at ? new Date(order.created_at).getTime() : NaN;
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt >= FEEDBACK_ELIGIBLE_AFTER_MS;
}

function isComponentFeedbackComplete(draft: FeedbackDraft): boolean {
  return Boolean(draft.favoriteItemId && draft.dislikedItemId && draft.irritatedItemId && draft.repurchaseItemId);
}

function parseSnapshotItems(raw: unknown): FeedbackItemOption[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedbackItemOption[] = [];
  raw.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const o = item as Record<string, unknown>;
      const id = String(o.sku_id ?? o.component_id ?? o.id ?? '').trim();
      const name = String(o.name ?? '').trim();
      if (!id || !name) return;
      out.push({
        id,
        name,
        productType: typeof o.product_type === 'string' ? o.product_type : null,
      });
    });
  return out;
}

/** 선물권 주문 카드 — 자체 복사 상태가 필요해 별도 컴포넌트로 분리 */
function GiftVoucherOrderCard({ order, isEn }: { order: Order; isEn: boolean }) {
  const tr = (en: string, ru: string) => (isEn ? en : ru);
  const [copied, setCopied] = React.useState(false);
  const giftCode = order.items[0]?.id ?? null;

  const handleCopy = async () => {
    if (!giftCode) return;
    try { await navigator.clipboard.writeText(giftCode); } catch { /* 폴백 무시 */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  };

  const handleShare = async () => {
    if (!giftCode) return;
    const text = tr(
      `A gift for you — SEMO K-Beauty Box! 🎁\nCode: ${giftCode}\nActivate at: semo-box.com/profile/coupons`,
      `Тебе подарок — SEMO K-Beauty бокс! 🎁\nКод: ${giftCode}\nАктивируй на: semo-box.com/profile/coupons`,
    );
    if (navigator.share) { try { await navigator.share({ text }); } catch { /* cancelled */ } }
    else { await handleCopy(); }
  };

  return (
    <li
      id={`order-card-${order.id}`}
      className="overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft/60 via-brand-soft/30 to-white shadow-sm"
    >
      <div className="border-b border-brand/10 bg-brand-soft/40 px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg" role="img" aria-label="gift">🎁</span>
            <p className="text-sm font-semibold text-slate-900">
              {tr('Gift Voucher', 'Подарочный сертификат')}
            </p>
          </div>
          <span className="text-xs text-slate-400">{order.date}</span>
        </div>
      </div>
      <div className="px-5 py-4 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-brand">
          {tr('Voucher code', 'Код сертификата')}
        </p>
        <p className="mt-1.5 font-mono text-2xl font-bold tracking-widest text-slate-900">
          {giftCode ?? '—'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {order.total.toLocaleString('ru-RU')} ₽ · {tr('Valid 1 year from purchase', 'Действует 1 год с момента покупки')}
        </p>
        {giftCode && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleShare()}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand/90"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {tr('Send gift', 'Отправить')}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-white px-4 py-2 text-xs font-semibold text-brand transition hover:bg-brand-soft/40"
            >
              {copied ? tr('Copied!', 'Скопировано!') : tr('Copy code', 'Скопировать')}
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

/** 배송 전 상태만 수령인 정보 수정 가능 (발송 중 이전) */
const canEditShipping = (status: Order['status']) =>
  ['pending', 'completed', 'product_preparing', 'shipping_soon'].includes(status);

export const ProfileOrders: React.FC = () => {
  const { isLoggedIn, initialized, userId } = useAuth();
  const { language } = useI18n();
  const isEn = language === 'en';
  const tr = (en: string, ru: string) => (isEn ? en : ru);
  const [searchParams] = useSearchParams();
  const highlightOrderId = searchParams.get('order');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  /** 수정 중인 주문 id. 설정 시 해당 카드에 인라인 수정 폼 표시 */
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ receiver_name: '', receiver_phone: '', shipping_address: '' });
  const [feedbackByOrderId, setFeedbackByOrderId] = useState<Record<string, RecommendationFeedbackRow>>({});
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
  const [snapshotItemsById, setSnapshotItemsById] = useState<Record<string, FeedbackItemOption[]>>({});
  const [componentItemsByProductId, setComponentItemsByProductId] = useState<Record<string, FeedbackItemOption[]>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !userId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const client = supabase;
    const mapRows = (rows: DbOrder[] | null): Order[] =>
      (rows ?? []).map((row: DbOrder) => {
        const ft = parseFulfillmentTracking(row.fulfillment_tracking);
        return {
          id: row.id,
          order_number: row.order_number ?? null,
          date: row.created_at ? new Date(row.created_at).toLocaleDateString('en-US') : '',
          created_at: row.created_at ?? null,
          total: (row.total_cents ?? 0) / 100,
          status: normalizeOrderStatus(row.status),
          items: Array.isArray(row.items) ? row.items : [],
          receiver_name: row.receiver_name ?? null,
          receiver_phone: row.receiver_phone ?? null,
          shipping_address: row.shipping_address ?? null,
          tracking_url: row.tracking_url ?? null,
          fulfillmentTracking: ft,
          is_test: row.is_test ?? false,
          recommendation_snapshot_id: row.recommendation_snapshot_id ?? null,
          order_type: row.order_type ?? null,
        };
      });

    void (async () => {
      const { data, error } = await client
        .from('orders')
        .select(
          'id, order_number, created_at, total_cents, status, items, receiver_name, receiver_phone, shipping_address, tracking_url, fulfillment_tracking, is_test, recommendation_snapshot_id',
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        if (error) {
          console.warn('[ProfileOrders] select error (retry without fulfillment_tracking):', error.message);
          client
            .from('orders')
            .select(
              'id, order_number, created_at, total_cents, status, items, receiver_name, receiver_phone, shipping_address, tracking_url, is_test',
            )
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .then(({ data: data2, error: err2 }) => {
              if (err2) {
                console.warn('[ProfileOrders] retry minimal:', err2.message);
                client
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
                    setLoading(false);
                  });
                return;
              }
              setOrders(mapRows(data2 as DbOrder[]));
              setLoading(false);
            });
          return;
        }
        setOrders(mapRows(data as DbOrder[]));
      setLoading(false);
    })().catch(() => {
      setOrders([]);
      setLoading(false);
    });
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId) return;
    supabase
      .from('recommendation_feedback')
      .select('id, order_id, overall_rating, skin_fit_rating, irritation_reported, repurchase_intent, comment, component_feedback, reward_points, rewarded_at')
      .eq('user_id', userId)
      .then(({ data }) => {
        const next: Record<string, RecommendationFeedbackRow> = {};
        ((data ?? []) as RecommendationFeedbackRow[]).forEach((row) => {
          if (row.order_id) next[row.order_id] = row;
        });
        setFeedbackByOrderId(next);
      });
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId || orders.length === 0) return;
    const ids = [...new Set(orders.map((o) => o.recommendation_snapshot_id).filter((v): v is string => !!v))];
    if (ids.length === 0) return;
    supabase
      .from('recommendation_snapshots')
      .select('id, recommended_items')
      .in('id', ids)
      .then(({ data }) => {
        const next: Record<string, FeedbackItemOption[]> = {};
        ((data ?? []) as { id: string; recommended_items: unknown }[]).forEach((row) => {
          next[row.id] = parseSnapshotItems(row.recommended_items);
        });
        setSnapshotItemsById(next);
      });
  }, [orders, userId]);

  useEffect(() => {
    if (!supabase || orders.length === 0) return;
    const productIds = [
      ...new Set(
        orders
          .flatMap((order) => order.items)
          .map((item) => item.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (productIds.length === 0) return;
    supabase
      .from('product_components')
      .select('product_id, sort_order, name, sku_id, sku_items(display_name, name, name_en, product_type, brand)')
      .in('product_id', productIds)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        const next: Record<string, FeedbackItemOption[]> = {};
        ((data ?? []) as ProductComponentOptionRow[]).forEach((row) => {
          const sku = row.sku_items;
          const name = resolveSkuStorefrontName({
            name_en: sku?.name_en,
            name: sku?.name,
            fallbackName: row.name ?? null,
            language,
          }).trim();
          if (!row.product_id || !name) return;
          const id = String(row.sku_id ?? `${row.product_id}:${row.sort_order ?? name}`).trim();
          if (!next[row.product_id]) next[row.product_id] = [];
          next[row.product_id].push({
            id,
            name,
            productType: typeof sku?.product_type === 'string' ? sku.product_type : null,
          });
        });
        Object.keys(next).forEach((productId) => {
          next[productId] = dedupeFeedbackOptions(next[productId]);
        });
        setComponentItemsByProductId(next);
      });
  }, [orders, language]);

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

  const getFeedbackDraft = (orderId: string) => feedbackDrafts[orderId] ?? emptyFeedbackDraft();
  const updateFeedbackDraft = (orderId: string, patch: Partial<FeedbackDraft>) => {
    setFeedbackDrafts((prev) => ({
      ...prev,
      [orderId]: {
        ...(prev[orderId] ?? emptyFeedbackDraft()),
        ...patch,
      },
    }));
  };

  const feedbackOptionsForOrder = (order: Order): FeedbackItemOption[] => {
    const fromSnapshot = order.recommendation_snapshot_id ? snapshotItemsById[order.recommendation_snapshot_id] ?? [] : [];
    if (fromSnapshot.length > 0) return dedupeFeedbackOptions(fromSnapshot);
    const fromComponents = order.items.flatMap((item) => componentItemsByProductId[item.id] ?? []);
    if (fromComponents.length > 0) return dedupeFeedbackOptions(fromComponents);
    return order.items.map((item) => ({ id: item.id, name: item.name }));
  };

  const renderProductSelect = (
    order: Order,
    value: string,
    onChange: (value: string) => void,
    placeholder: string,
    includeNone = false,
  ) => {
    const options = feedbackOptionsForOrder(order);
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
      >
        <option value="">{placeholder}</option>
        {includeNone && <option value="none">{tr('No specific product', 'Нет конкретного продукта')}</option>}
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {formatFeedbackProductType(item.productType, isEn)
              ? `${formatFeedbackProductType(item.productType, isEn)} · ${item.name}`
              : item.name}
          </option>
        ))}
      </select>
    );
  };

  const submitRecommendationFeedback = async (order: Order) => {
    if (!supabase || !userId || saving) return;
    if (feedbackByOrderId[order.id]) return;
    const draft = getFeedbackDraft(order.id);
    const comment = draft.comment.trim();
    if (!isFeedbackEligible(order)) {
      window.alert(tr('Feedback rewards open 7 days after delivery is completed.', 'Бонус за отзыв доступен через 7 дней после доставки.'));
      return;
    }
    if (!isComponentFeedbackComplete(draft)) {
      window.alert(tr('Please answer all product-level feedback questions.', 'Пожалуйста, ответьте на все вопросы по продуктам.'));
      return;
    }
    if (isLowQualityComment(comment)) {
      window.alert(tr(`Please write at least ${FEEDBACK_MIN_COMMENT_CHARS} meaningful characters about how the products worked for your skin.`, `Напишите не менее ${FEEDBACK_MIN_COMMENT_CHARS} содержательных символов о том, как продукты подошли вашей коже.`));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        user_id: userId,
        order_id: order.id,
        recommendation_snapshot_id: order.recommendation_snapshot_id ?? null,
        overall_rating: Number(draft.overall) || null,
        skin_fit_rating: Number(draft.skinFit) || null,
        irritation_reported: draft.irritation === 'yes',
        repurchase_intent: draft.repurchase === 'yes',
        component_feedback: {
          favorite_item_id: draft.favoriteItemId,
          disliked_item_id: draft.dislikedItemId === 'none' ? null : draft.dislikedItemId,
          irritated_item_id: draft.irritatedItemId === 'none' ? null : draft.irritatedItemId,
          repurchase_item_id: draft.repurchaseItemId === 'none' ? null : draft.repurchaseItemId,
        },
        comment,
        reward_points: FEEDBACK_REWARD_POINTS,
        rewarded_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('recommendation_feedback')
        .upsert(payload, { onConflict: 'user_id,order_id' })
        .select('id, order_id, overall_rating, skin_fit_rating, irritation_reported, repurchase_intent, comment, component_feedback, reward_points, rewarded_at')
        .single();
      if (error) throw error;
      const { error: pointsErr } = await supabase.rpc('apply_points_delta', {
        p_user_id: userId,
        p_delta_points: FEEDBACK_REWARD_POINTS,
        p_reason: 'recommendation_feedback_reward',
        p_source_table: 'recommendation_feedback',
        p_source_id: data.id,
        p_metadata: {
          order_id: order.id,
          order_number: order.order_number ?? order.id.slice(0, 8),
          reward_points: FEEDBACK_REWARD_POINTS,
        },
      });
      if (pointsErr) {
        const { data: current } = await supabase.from('profiles').select('points').eq('id', userId).single();
        const nextPoints = Math.max(0, Number(current?.points ?? 0) + FEEDBACK_REWARD_POINTS);
        await supabase.from('profiles').update({ points: nextPoints }).eq('id', userId);
      }
      if (data?.order_id) {
        setFeedbackByOrderId((prev) => ({ ...prev, [data.order_id as string]: data as RecommendationFeedbackRow }));
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Failed to save feedback');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-[length:calc(0.875rem-1pt)] font-medium text-brand hover:opacity-90"><BackArrow /> {tr('Profile', 'Профиль')}</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-[length:calc(1.25rem-1pt)] font-semibold tracking-tight text-slate-900 sm:text-[length:calc(1.5rem-1pt)]">
          {tr('Order history', 'История заказов')}
        </h1>
        <p className="mt-1 text-[length:calc(0.875rem-1pt)] text-slate-500">
          {tr('Orders and delivery tracking', 'Заказы и отслеживание доставки')}
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
        {orders.map((order) => {
          /* ── 선물권 주문: 별도 컴포넌트로 렌더링 ── */
          if (order.order_type === 'gift_voucher') {
            return <GiftVoucherOrderCard key={order.id} order={order} isEn={isEn} />;
          }

          return (
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
              const ft = order.fulfillmentTracking ?? null;
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

            {(['delivered', 'confirmed'].includes(order.status) || feedbackByOrderId[order.id]) && (
            <div className="border-b border-slate-100 px-5 py-3 sm:px-6">
              {feedbackByOrderId[order.id] ? (
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-[length:calc(0.875rem-1pt)] text-emerald-800">
                  {tr('Thank you. Your skincare feedback was saved and', 'Спасибо. Ваш отзыв об уходе сохранён, и')} {feedbackByOrderId[order.id].reward_points ?? FEEDBACK_REWARD_POINTS}P {tr('was added.', 'начислено.')}
                </div>
              ) : (
                <div className={`rounded-xl border p-4 ${isFeedbackEligible(order) ? 'border-brand/25 bg-brand-soft/20' : 'border-slate-200 bg-slate-50/50'}`}>
                  <p className="text-sm font-semibold text-slate-900">{tr('How did this box work for your skin?', 'Как этот бокс подошёл вашей коже?')}</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {tr(
                      `After 7 days, rate the box and choose the specific items inside it. Complete all questions and write at least ${FEEDBACK_MIN_COMMENT_CHARS} meaningful characters to receive ${FEEDBACK_REWARD_POINTS}P automatically.`,
                      `Через 7 дней оцените бокс и выберите конкретные продукты внутри него. Ответьте на все вопросы и напишите отзыв минимум на ${FEEDBACK_MIN_COMMENT_CHARS} содержательных символов, чтобы автоматически получить ${FEEDBACK_REWARD_POINTS}P.`,
                    )}
                  </p>
                  {!isFeedbackEligible(order) && (
                    <p className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-medium text-slate-500">
                      {tr('Feedback reward is not open yet for this order.', 'Бонус за отзыв по этому заказу пока недоступен.')}
                    </p>
                  )}
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Overall satisfaction', 'Общая оценка')}
                      <select
                        value={getFeedbackDraft(order.id).overall}
                        onChange={(e) => updateFeedbackDraft(order.id, { overall: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Skin fit', 'Подошло коже')}
                      <select
                        value={getFeedbackDraft(order.id).skinFit}
                        onChange={(e) => updateFeedbackDraft(order.id, { skinFit: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Irritation', 'Раздражение')}
                      <select
                        value={getFeedbackDraft(order.id).irritation}
                        onChange={(e) => updateFeedbackDraft(order.id, { irritation: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="no">{tr('No', 'Нет')}</option>
                        <option value="yes">{tr('Yes', 'Да')}</option>
                      </select>
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Repurchase intent', 'Хотели бы купить снова')}
                      <select
                        value={getFeedbackDraft(order.id).repurchase}
                        onChange={(e) => updateFeedbackDraft(order.id, { repurchase: e.target.value })}
                        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="yes">{tr('Yes', 'Да')}</option>
                        <option value="no">{tr('No', 'Нет')}</option>
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Which item inside the box did you like the most?', 'Какой продукт внутри бокса понравился больше всего?')}
                      {renderProductSelect(order, getFeedbackDraft(order.id).favoriteItemId, (value) => updateFeedbackDraft(order.id, { favoriteItemId: value }), tr('Select product', 'Выберите продукт'))}
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Which item inside the box did not work well for you?', 'Какой продукт внутри бокса вам не подошёл?')}
                      {renderProductSelect(order, getFeedbackDraft(order.id).dislikedItemId, (value) => updateFeedbackDraft(order.id, { dislikedItemId: value }), tr('Select product', 'Выберите продукт'), true)}
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Did any item inside the box cause irritation?', 'Был ли продукт внутри бокса, который вызвал раздражение?')}
                      {renderProductSelect(order, getFeedbackDraft(order.id).irritatedItemId, (value) => updateFeedbackDraft(order.id, { irritatedItemId: value }), tr('Select product', 'Выберите продукт'), true)}
                    </label>
                    <label className="text-xs font-medium text-slate-600">
                      {tr('Which item inside the box would you buy again?', 'Какой продукт внутри бокса вы хотели бы купить снова?')}
                      {renderProductSelect(order, getFeedbackDraft(order.id).repurchaseItemId, (value) => updateFeedbackDraft(order.id, { repurchaseItemId: value }), tr('Select product', 'Выберите продукт'), true)}
                    </label>
                  </div>
                  <textarea
                    rows={2}
                    placeholder={tr('Write how the box items felt on your skin. Minimum 30 meaningful characters.', 'Напишите, как продукты из бокса ощущались на коже. Минимум 30 содержательных символов.')}
                    value={getFeedbackDraft(order.id).comment}
                    onChange={(e) => updateFeedbackDraft(order.id, { comment: e.target.value })}
                    className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-right text-[11px] text-slate-400">
                    {compactCommentLength(getFeedbackDraft(order.id).comment)}/{FEEDBACK_MIN_COMMENT_CHARS}
                  </p>
                  <button
                    type="button"
                    disabled={saving || !isFeedbackEligible(order) || !isComponentFeedbackComplete(getFeedbackDraft(order.id)) || isLowQualityComment(getFeedbackDraft(order.id).comment)}
                    onClick={() => void submitRecommendationFeedback(order)}
                    className="mt-3 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
                  >
                    {tr(`Save feedback and get ${FEEDBACK_REWARD_POINTS}P`, `Сохранить отзыв и получить ${FEEDBACK_REWARD_POINTS}P`)}
                  </button>
                </div>
              )}
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
          );
        })}
      </ul>
      )}
    </main>
  );
};
