// HTTP: бот передаёт telegram_id + секрет → JSON RPC + готовый текст для sendMessage.
// Логика текста дублирует src/lib/telegramOrdersFormat.ts (при правках — синхронизировать).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
};

function json(res: object, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

type OrderShipmentStatus =
  | 'pending'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'product_preparing'
  | 'shipping_soon'
  | 'shipped'
  | 'delivered'
  | 'confirmed';

const ORDER_STATUS_LABEL_RU: Record<OrderShipmentStatus, string> = {
  pending: 'Ожидает оплаты',
  completed: 'Оплачен',
  failed: 'Ошибка оплаты',
  canceled: 'Отменён',
  product_preparing: 'Готовим заказ',
  shipping_soon: 'Готовим к отправке',
  shipped: 'В пути',
  delivered: 'Доставлен',
  confirmed: 'Заказ получен',
};

function normalizeOrderStatus(s: string | undefined): OrderShipmentStatus {
  if (!s) return 'pending';
  const v = s.toLowerCase();
  if (v === 'paid') return 'completed';
  if (v === 'cancelled') return 'canceled';
  const allowed: OrderShipmentStatus[] = [
    'pending',
    'completed',
    'canceled',
    'failed',
    'product_preparing',
    'shipping_soon',
    'shipped',
    'delivered',
    'confirmed',
  ];
  return allowed.includes(v as OrderShipmentStatus) ? (v as OrderShipmentStatus) : 'pending';
}

function parseFt(raw: unknown): {
  carrier?: string | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  events?: { at: string; label_ru: string; location?: string }[];
} | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const eventsRaw = o.events;
  let events: { at: string; label_ru: string; location?: string }[] | undefined;
  if (Array.isArray(eventsRaw)) {
    events = eventsRaw
      .filter((e): e is Record<string, unknown> => e != null && typeof e === 'object')
      .map((e) => ({
        at: typeof e.at === 'string' ? e.at : '',
        label_ru: typeof e.label_ru === 'string' ? e.label_ru : '—',
        location: typeof e.location === 'string' ? e.location : undefined,
      }))
      .filter((e) => e.at.length > 0);
  }
  return {
    carrier: typeof o.carrier === 'string' ? o.carrier : null,
    tracking_number: typeof o.tracking_number === 'string' ? o.tracking_number : null,
    tracking_url: typeof o.tracking_url === 'string' ? o.tracking_url : null,
    events: events?.length ? events : undefined,
  };
}

function resolveUrl(ft: ReturnType<typeof parseFt>, legacy: string | null | undefined): string | null {
  const a = ft?.tracking_url?.trim();
  if (a) return a;
  const b = legacy?.trim();
  return b || null;
}

function eventsNewest(ft: NonNullable<ReturnType<typeof parseFt>>, limit: number) {
  const ev = ft?.events;
  if (!ev?.length) return [];
  return [...ev].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, limit);
}

function formatMoneyRub(cents: number | null | undefined): string {
  if (cents == null || Number.isNaN(cents)) return '—';
  return `${Math.round(cents / 100).toLocaleString('ru-RU')} ₽`;
}

function formatDateRu(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU') || iso;
  } catch {
    return iso;
  }
}

function carrierLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    cdek: 'СДЭК',
    pochta_ru: 'Почта России',
    boxberry: 'Boxberry',
    other: 'Доставка',
  };
  return m[code] ?? code;
}

function formatMessage(
  rpc: { ok?: boolean; error?: string; orders?: unknown[]; total_count?: number },
  ordersPageUrl: string,
): string {
  if (!rpc.ok) {
    if (rpc.error === 'telegram_not_linked') {
      return 'Аккаунт не привязан к сайту. Откройте профиль на сайте и привяжите Telegram.';
    }
    return 'Не удалось загрузить заказы. Попробуйте позже.';
  }
  const orders = (rpc.orders ?? []) as {
    id: string;
    order_number?: string | null;
    created_at: string;
    status: string;
    total_cents?: number | null;
    receiver_name?: string | null;
    receiver_phone?: string | null;
    shipping_address?: string | null;
    tracking_url?: string | null;
    fulfillment_tracking?: unknown | null;
  }[];
  const total = rpc.total_count ?? orders.length;

  if (orders.length === 0) {
    return `📦 Заказов пока нет.\n\nВсе заказы: ${ordersPageUrl}`;
  }

  const lines: string[] = ['📦 Последние заказы', ''];

  orders.forEach((o, i) => {
    const st = normalizeOrderStatus(o.status);
    const label = ORDER_STATUS_LABEL_RU[st];
    const num = o.order_number?.trim() || o.id.slice(0, 8);
    const ft = parseFt(o.fulfillment_tracking);
    const trackUrl = resolveUrl(ft, o.tracking_url);
    const evs = ft ? eventsNewest(ft, 2) : [];

    lines.push(`${i + 1}) № ${num} · ${formatDateRu(o.created_at)}`);
    lines.push(`Статус: ${label}`);
    lines.push(`Сумма: ${formatMoneyRub(o.total_cents ?? null)}`);
    if (o.receiver_name?.trim()) lines.push(`Получатель: ${o.receiver_name.trim()}`);
    if (o.receiver_phone?.trim()) lines.push(`Телефон: ${o.receiver_phone.trim()}`);
    if (o.shipping_address?.trim()) lines.push(`Адрес: ${o.shipping_address.trim()}`);
    if (ft?.carrier) {
      const cl = carrierLabel(ft.carrier);
      if (cl) lines.push(`Перевозчик: ${cl}`);
    }
    if (ft?.tracking_number?.trim()) lines.push(`Трек-номер: ${ft.tracking_number.trim()}`);
    if (trackUrl) lines.push(`Отслеживание: ${trackUrl}`);
    if (evs.length > 0) {
      lines.push('События доставки:');
      for (const ev of evs) {
        const when = formatDateRu(ev.at);
        const loc = ev.location ? ` · ${ev.location}` : '';
        lines.push(`  · ${when} — ${ev.label_ru}${loc}`);
      }
    }
    lines.push('');
  });

  if (total > orders.length) lines.push(`Всего заказов: ${total}.`);
  lines.push(`Ещё заказы: ${ordersPageUrl}`);

  return lines.join('\n').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const secret = Deno.env.get('TELEGRAM_ORDERS_PREVIEW_SECRET');
  const got = req.headers.get('x-telegram-bot-secret') ?? '';
  if (!secret || got !== secret) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const siteBase = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://semo-box.ru').replace(/\/$/, '');
  const ordersPageUrl = `${siteBase}/profile/orders`;

  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500);

  let telegram_id: string | null = null;
  try {
    const body = await req.json();
    telegram_id = typeof body.telegram_id === 'string' ? body.telegram_id : null;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!telegram_id?.trim()) return json({ error: 'telegram_id required' }, 400);

  const supabase = createClient(supabaseUrl, serviceRole);
  const { data: rpc, error } = await supabase.rpc('telegram_orders_preview', {
    p_telegram_id: telegram_id.trim(),
  });

  if (error) return json({ error: error.message }, 500);

  const payload = rpc as { ok?: boolean; error?: string; orders?: unknown[]; total_count?: number };
  const message_ru = formatMessage(payload, ordersPageUrl);

  return json({
    ...payload,
    message_ru,
    orders_page_url: ordersPageUrl,
  });
});
