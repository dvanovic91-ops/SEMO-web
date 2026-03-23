/**
 * Статусы заказа в БД и подписи для ЛК / Telegram (рус.).
 * Единая точка — веб и бот показывают одни и те же названия этапов.
 */

export type OrderShipmentStatus =
  | 'pending'
  | 'completed'
  | 'canceled'
  | 'failed'
  | 'product_preparing'
  | 'shipping_soon'
  | 'shipped'
  | 'delivered'
  | 'confirmed';

/** DB legacy: paid → completed, cancelled → canceled */
export function normalizeOrderStatus(s: string | undefined): OrderShipmentStatus {
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

export const ORDER_STATUS_LABEL_RU: Record<OrderShipmentStatus, string> = {
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
