/**
 * 알림 종류·metadata → 앱 내 경로.
 * 공지는 metadata.announcement_category(표시용), metadata.link_to(이동) 사용.
 */

export type AnnouncementCategory =
  | 'discount'
  | 'new_product'
  | 'event'
  | 'general'
  | 'shipping'
  | 'other';

export type NotificationLinkTarget =
  | 'promo'
  | 'shop'
  | 'profile'
  | 'points'
  | 'orders'
  | 'skin-test'
  | 'support'
  | 'home'
  | 'journey'
  | 'about';

const LINK_MAP: Record<NotificationLinkTarget, string> = {
  promo: '/promo',
  shop: '/shop',
  profile: '/profile',
  points: '/profile/points',
  orders: '/profile/orders',
  'skin-test': '/skin-test',
  support: '/support',
  home: '/',
  journey: '/journey',
  about: '/about',
};

function isLinkTarget(v: string): v is NotificationLinkTarget {
  return v in LINK_MAP;
}

/** 사용자 UI(러시아어): 공지 유형 뱃지 */
export function announcementCategoryLabelRu(cat: string | undefined | null): string {
  switch (cat) {
    case 'discount':
      return 'Скидки и акции';
    case 'new_product':
      return 'Новинки';
    case 'event':
      return 'События';
    case 'shipping':
      return 'Доставка';
    case 'other':
      return 'Прочее';
    case 'general':
    default:
      return 'Новости';
  }
}

/** 알림 한 줄에서 보여줄 종류 라벨 (러시아어) */
export function notificationKindBadgeRu(
  kind: string,
  metadata: Record<string, unknown> | null | undefined,
): string {
  if (kind === 'order_status') {
    return 'Заказ';
  }
  if (kind === 'points') {
    return 'Баллы';
  }
  if (kind === 'admin') {
    const cat = metadata && typeof metadata.announcement_category === 'string' ? metadata.announcement_category : null;
    return announcementCategoryLabelRu(cat);
  }
  return 'Уведомление';
}

/**
 * 알림 클릭 시 이동할 경로. 없으면 null (클릭 동작 없음).
 */
export function resolveNotificationHref(kind: string, metadata: Record<string, unknown> | null | undefined): string | null {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  if (kind === 'order_status') {
    const oid = meta.order_id;
    if (typeof oid === 'string' && oid.length > 0) {
      return `/profile/orders?order=${encodeURIComponent(oid)}`;
    }
    return '/profile/orders';
  }
  if (kind === 'points') {
    return '/profile/points';
  }
  if (kind === 'admin') {
    const raw = meta.link_to;
    const link = typeof raw === 'string' && raw.length > 0 ? raw : 'promo';
    if (isLinkTarget(link)) {
      return LINK_MAP[link];
    }
    return LINK_MAP.promo;
  }
  return null;
}
