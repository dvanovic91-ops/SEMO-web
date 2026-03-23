/**
 * Текст превью заказов для Telegram (последние 3) — дублируется в Edge Function для HTTP-вызова бота.
 * Синхронизировать: supabase/functions/telegram-orders-preview/format.ts
 */

import {
  carrierLabelRu,
  fulfillmentEventsSortedNewestFirst,
  parseFulfillmentTracking,
  resolveTrackingUrl,
} from './fulfillmentTracking';
import { normalizeOrderStatus, ORDER_STATUS_LABEL_RU } from './orderStatusRu';

export type TelegramOrderRpcRow = {
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
};

export type TelegramOrdersPreviewPayload = {
  ok: boolean;
  orders?: TelegramOrderRpcRow[];
  total_count?: number;
  error?: string;
};

function escapeTelegramPlain(s: string): string {
  return s.replace(/\r\n/g, '\n').trim();
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

/**
 * Форматирует ответ RPC `telegram_orders_preview` в сообщение для sendMessage (plain text).
 */
export function formatTelegramOrdersPreviewMessage(
  payload: TelegramOrdersPreviewPayload,
  ordersPageUrl: string,
): string {
  if (!payload.ok) {
    if (payload.error === 'telegram_not_linked') {
      return 'Аккаунт не привязан к сайту. Откройте профиль на сайте и привяжите Telegram.';
    }
    return 'Не удалось загрузить заказы. Попробуйте позже.';
  }

  const orders = payload.orders ?? [];
  const total = payload.total_count ?? orders.length;

  if (orders.length === 0) {
    return escapeTelegramPlain(`📦 Заказов пока нет.\n\nВсе заказы: ${ordersPageUrl}`);
  }

  const lines: string[] = ['📦 Последние заказы', ''];

  orders.forEach((o, i) => {
    const st = normalizeOrderStatus(o.status);
    const label = ORDER_STATUS_LABEL_RU[st];
    const num = o.order_number?.trim() || o.id.slice(0, 8);
    const ft = parseFulfillmentTracking(o.fulfillment_tracking);
    const trackUrl = resolveTrackingUrl(ft, o.tracking_url);
    const events = fulfillmentEventsSortedNewestFirst(ft, 2);

    lines.push(`${i + 1}) № ${num} · ${formatDateRu(o.created_at)}`);
    lines.push(`Статус: ${label}`);
    lines.push(`Сумма: ${formatMoneyRub(o.total_cents ?? null)}`);
    if (o.receiver_name?.trim()) lines.push(`Получатель: ${o.receiver_name.trim()}`);
    if (o.receiver_phone?.trim()) lines.push(`Телефон: ${o.receiver_phone.trim()}`);
    if (o.shipping_address?.trim()) {
      lines.push(`Адрес: ${escapeTelegramPlain(o.shipping_address)}`);
    }
    if (ft?.carrier) {
      const cl = carrierLabelRu(ft.carrier);
      if (cl) lines.push(`Перевозчик: ${cl}`);
    }
    if (ft?.tracking_number?.trim()) {
      lines.push(`Трек-номер: ${ft.tracking_number.trim()}`);
    }
    if (trackUrl) {
      lines.push(`Отслеживание: ${trackUrl}`);
    }
    if (events.length > 0) {
      lines.push('События доставки:');
      for (const ev of events) {
        const when = formatDateRu(ev.at);
        const loc = ev.location ? ` · ${ev.location}` : '';
        lines.push(`  · ${when} — ${ev.label_ru}${loc}`);
      }
    }
    lines.push('');
  });

  if (total > orders.length) {
    lines.push(`Всего заказов: ${total}.`);
  }
  lines.push(`Ещё заказы: ${ordersPageUrl}`);

  return escapeTelegramPlain(lines.join('\n'));
}

export function buildOrdersPageUrl(siteBase: string): string {
  const base = siteBase.replace(/\/$/, '');
  return `${base}/profile/orders`;
}
