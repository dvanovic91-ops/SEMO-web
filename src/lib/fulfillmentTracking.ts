/**
 * Структура orders.fulfillment_tracking (jsonb) — СДЭК / Почта / др., веб и Telegram.
 */

export type CarrierCode = 'cdek' | 'pochta_ru' | 'boxberry' | 'other' | string;

export interface FulfillmentTrackingEvent {
  at: string;
  code?: string;
  label_ru: string;
  location?: string;
}

export interface FulfillmentTracking {
  carrier?: CarrierCode | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  events?: FulfillmentTrackingEvent[];
  last_synced_at?: string | null;
  meta?: Record<string, unknown>;
}

export function parseFulfillmentTracking(raw: unknown): FulfillmentTracking | null {
  if (raw == null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const eventsRaw = o.events;
  let events: FulfillmentTrackingEvent[] | undefined;
  if (Array.isArray(eventsRaw)) {
    events = eventsRaw
      .filter((e): e is Record<string, unknown> => e != null && typeof e === 'object')
      .map((e) => ({
        at: typeof e.at === 'string' ? e.at : '',
        code: typeof e.code === 'string' ? e.code : undefined,
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
    last_synced_at: typeof o.last_synced_at === 'string' ? o.last_synced_at : null,
    meta: o.meta && typeof o.meta === 'object' ? (o.meta as Record<string, unknown>) : undefined,
  };
}

/** Ссылка на трекинг: JSON приоритетнее, затем legacy orders.tracking_url */
export function resolveTrackingUrl(ft: FulfillmentTracking | null, legacyTrackingUrl: string | null | undefined): string | null {
  const fromJson = ft?.tracking_url?.trim();
  if (fromJson) return fromJson;
  const leg = legacyTrackingUrl?.trim();
  return leg || null;
}

/** Для карточки заказа: последние N событий (новые сверху). */
/** Короткое имя перевозчика для ЛК / Telegram */
export function carrierLabelRu(code: string | null | undefined): string | null {
  if (!code) return null;
  const m: Record<string, string> = {
    cdek: 'СДЭК',
    // 'pochta_ru'는 러시아 우편 캐리어 코드지만, 라벨은 다국가용으로 중립 표기
    pochta_ru: 'Почта',
    boxberry: 'Boxberry',
    other: 'Доставка',
  };
  return m[code] ?? code;
}

export function fulfillmentEventsSortedNewestFirst(ft: FulfillmentTracking | null, limit = 4): FulfillmentTrackingEvent[] {
  const ev = ft?.events;
  if (!ev?.length) return [];
  return [...ev]
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}
