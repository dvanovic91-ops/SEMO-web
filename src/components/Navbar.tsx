import { Link, NavLink, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useProductNavReplacement } from '../context/ProductNavReplacementContext';
import { supabase } from '../lib/supabase';
import { useCart } from '../context/CartContext';
import { useNotifications, type NotificationRow } from '../hooks/useNotifications';
import { useSkinReminderBadge } from '../hooks/useSkinReminderBadge';
import { notificationKindBadgeRu, resolveNotificationHref } from '../lib/notificationNavigation';
import { SEMO_BOX_SUBMENU, isSemoBoxSubmenuPath } from '../lib/semoBoxSubmenu';
import { formatCurrencyAmount } from '../lib/market';
import { formatStorefrontDateTimeShort } from '../lib/formatStorefrontDate';
import { t } from '../i18n/messages';
const navLinkBase =
  'text-sm tracking-wide transition-colors border-b-2 border-transparent pb-1';

const activeClass = 'text-brand border-brand font-semibold';
const inactiveClass = 'text-slate-900 hover:text-brand';

/** 텔레그램 봇 — 지원/поддержка 링크 */
const TELEGRAM_BOT_URL = 'https://t.me/My_SEMO_Beautybot';

/** 모바일 하단 고정 탭: 기본 h-5(1.25rem) 대비 +1pt · 선 굵기 통일(장바구니만 시각적으로 커 보여 약간 축소) */
const MOBILE_TAB_ICON = 'h-[calc(1.25rem+1pt)] w-[calc(1.25rem+1pt)]';
const MOBILE_TAB_STROKE = { on: 2 as const, off: 1.75 as const };
const MOBILE_TAB_ICON_WRAP = `relative inline-flex ${MOBILE_TAB_ICON} shrink-0`;
const MOBILE_TAB_PROFILE_RING = 'h-[calc(1.75rem+1pt)] w-[calc(1.75rem+1pt)]';
const MOBILE_TAB_PROFILE_SVG = 'h-[calc(1rem+1pt)] w-[calc(1rem+1pt)]';

const NAV_LINKS: { to: string; label: string }[] = [
  { to: '/about', label: 'About SEMO' },
  { to: '/journey', label: 'Journey to SEMO' },
  { to: '/support', label: 'FAQ' },
];

function formatPrice(price: number, currency: 'RUB' | 'USD' | 'KZT' | 'UZS'): string {
  return formatCurrencyAmount(price, currency);
}

/** 모바일 서브바 라벨 미세 위치 조정(vw) */
function mobileSemoSubnavLabelShift(to: string): string {
  if (to === '/skin-test' || to === '/promo') return 'translate-x-[3vw]';
  if (to === '/shop') return 'translate-x-[1vw]';
  if (to === '/inner-beauty') return 'translate-x-[-1vw]';
  return '';
}

/**
 * 모바일 서브바 5열 — flex 가중치로 «Beauty box» 칸 확보, 필요한 항목만 translate-x.
 */
function mobileSemoSubnavCellFlex(to: string): string {
  switch (to) {
    case '/shop':
      return 'min-w-0 flex-[1.6] basis-0';
    case '/skin-test':
      return 'min-w-0 flex-[1.15] basis-0';
    case '/inner-beauty':
    case '/hair-beauty':
      return 'min-w-0 flex-[1] basis-0';
    case '/promo':
      return 'min-w-0 flex-[0.75] basis-0';
    default:
      return 'min-w-0 flex-1 basis-0';
  }
}

/** /product?id... 에 붙는 catalog 값을 SEMO 서브메뉴 경로로 매핑 */
function productCatalogToSubmenuPath(catalog: string | null): string | null {
  if (!catalog) return null;
  const c = catalog.trim().toLowerCase();
  if (c === 'beauty') return '/shop';
  if (c === 'inner_beauty' || c === 'inner-beauty') return '/inner-beauty';
  if (c === 'hair_beauty' || c === 'hair-beauty') return '/hair-beauty';
  return null;
}

export const Navbar: React.FC = () => {
  const { productStickyReplacesNav, productDesktopNav } = useProductNavReplacement();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const { items, total, totalCount, updateQuantity } = useCart();
  const { isLoggedIn, userId } = useAuth();
  const { count: skinReminderCount } = useSkinReminderBadge(userId, 'monthly');
  const { language, currency, country, setLanguage, setCurrency } = useI18n();
  /** true: аккаунт привязан к Telegram — иконка в шапке #26A5E4; иначе тёмная */
  const [telegramLinkedNav, setTelegramLinkedNav] = useState<boolean | null>(null);
  const { items: notificationItems, unreadCount, markAllRead, markNotificationRead, deleteNotification } =
    useNotifications(isLoggedIn ? userId : null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileLocaleQuickOpen, setMobileLocaleQuickOpen] = useState(false);
  const [mobileLocaleQuickDismissed, setMobileLocaleQuickDismissed] = useState(false);
  const [semoBoxOpen, setSemoBoxOpen] = useState(false);
  /** 데스크톱: SEMO Box를 클릭해 연 경우 — 마우스가 벗어나도 호버처럼 서브바 유지 */
  const [semoBoxPinned, setSemoBoxPinned] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [cartPopoverOpen, setCartPopoverOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const currencyMenuRef = useRef<HTMLDivElement>(null);
  const semoBoxDesktopRef = useRef<HTMLDivElement>(null);
  /** 데스크톱 SEMO Box 하단 서브바 — 외부 클릭 시 헤더 트리거와 함께 «안쪽»으로 인식 */
  const semoBoxSubbarRef = useRef<HTMLDivElement>(null);
  const semoBoxCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** SEMO Box hover 영역 진입 — 타이머 취소 후 열기 */
  const semoBoxEnter = useCallback(() => {
    if (semoBoxCloseTimer.current) { clearTimeout(semoBoxCloseTimer.current); semoBoxCloseTimer.current = null; }
    setSemoBoxOpen(true);
  }, []);
  /** SEMO Box hover 영역 이탈 — 딜레이 후 닫기 (서브바로 이동 시 취소됨). 클릭으로 고정(pin)된 경우는 닫지 않음 */
  const semoBoxLeave = useCallback(() => {
    if (semoBoxPinned) return;
    if (semoBoxCloseTimer.current) clearTimeout(semoBoxCloseTimer.current);
    semoBoxCloseTimer.current = setTimeout(() => {
      setSemoBoxOpen(false);
      semoBoxCloseTimer.current = null;
    }, 200);
  }, [semoBoxPinned]);
  /** 데스크톱: FAB + 팝오버 / 모바일: 하단 시트 — 외부 클릭 감지용 */
  const cartDesktopRef = useRef<HTMLDivElement>(null);
  const cartMobileRef = useRef<HTMLDivElement>(null);
  const notificationDesktopRef = useRef<HTMLDivElement>(null);
  /** 팝업이 열린 뒤 장바구니 시그니처(항목 수·총수량). 변경 직후에는 딤/문서 클릭으로 닫지 않음 — 시트 축소 시 터치가 딤에 닿아 닫히는 현상 방지 */
  const cartContentSigRef = useRef<string | null>(null);
  const cartDismissGuardRef = useRef(false);

  // 프로필(및 하위) 진입 시 알림·장바구니 팝오버 닫기
  useEffect(() => {
    if (location.pathname.startsWith('/profile')) {
      setNotificationOpen(false);
      setCartPopoverOpen(false);
    }
  }, [location.pathname]);

  const refreshTelegramLinkedNav = useCallback(() => {
    if (!isLoggedIn || !userId || !supabase) {
      setTelegramLinkedNav(null);
      return;
    }
    void supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setTelegramLinkedNav(!!data?.telegram_id);
      });
  }, [isLoggedIn, userId]);

  useEffect(() => {
    refreshTelegramLinkedNav();
  }, [location.pathname, refreshTelegramLinkedNav]);

  useEffect(() => {
    try {
      const dismissed = localStorage.getItem('semo_mobile_locale_quick_dismissed');
      setMobileLocaleQuickDismissed(dismissed === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!langMenuOpen && !currencyMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (langMenuRef.current?.contains(t)) return;
      if (currencyMenuRef.current?.contains(t)) return;
      setLangMenuOpen(false);
      setCurrencyMenuOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onDocClick);
    };
  }, [langMenuOpen, currencyMenuOpen]);

  /** Вкладка/окно снова в фокусе — после привязки в другой вкладке цвет иконки обновится */
  useEffect(() => {
    if (!isLoggedIn || !userId) return;
    const onFocus = () => refreshTelegramLinkedNav();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [isLoggedIn, userId, refreshTelegramLinkedNav]);

  const markAllNotificationsRead = useCallback(() => {
    void markAllRead();
  }, [markAllRead]);

  const storefrontLocale = useMemo(() => ({ language, country, currency }), [language, country, currency]);

  const notificationRows = useMemo(
    () =>
      notificationItems.map((n: NotificationRow) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body ?? '',
        date: formatStorefrontDateTimeShort(n.created_at, storefrontLocale),
        unread: !n.read_at,
        kindLabel: notificationKindBadgeRu(n.kind, n.metadata),
        href: resolveNotificationHref(n.kind, n.metadata),
      })),
    [notificationItems, storefrontLocale],
  );

  const openNotificationTarget = useCallback(
    (row: { id: string; href: string | null; unread: boolean }) => {
      if (!row.href) return;
      setNotificationOpen(false);
      navigate(row.href);
      if (row.unread) {
        void markNotificationRead(row.id);
      }
    },
    [navigate, markNotificationRead],
  );

  /** 모바일 하단바: 현재 화면에 따른 아이콘 활성화 (강조용) */
  const path = location.pathname;
  const isSemoBoxActive = isSemoBoxSubmenuPath(path);
  /** 모바일 SEMO Box 하위 전체 + /product — 최상단 로고 줄 대신 서브메뉴 한 줄 */
  const pathNorm = (path.split('?')[0] ?? path).replace(/\/$/, '') || '/';
  const isProductDetailPath = pathNorm.startsWith('/product/');
  const productCatalogSubmenuPath = productCatalogToSubmenuPath(new URLSearchParams(location.search).get('catalog'));
  const isMobileSemoSubnavMerged =
    isSemoBoxActive || isProductDetailPath;
  const isHomeActive = path === '/';
  /** 모바일 하단: 뷰티박스(/shop) 탭 활성 — /shop·/shop/box-history 등 */
  const isShopTabActive = path === '/shop' || path.startsWith('/shop/');
  const isCartActive = path === '/cart' || cartPopoverOpen;
  const isNotificationActive = notificationOpen;
  const isProfileActive = path.startsWith('/profile') || path === '/login';
  const isMenuActive = NAV_LINKS.some((l) => (path === l.to || path.startsWith(l.to + '/')));
  const prevPathRef = useRef<string>(location.pathname + location.search);
  const semoSiblingPopGuardRef = useRef(false);

  useEffect(() => {
    const current = location.pathname + location.search;
    const prev = prevPathRef.current;
    const pathOnly = (full: string) => (full.split('?')[0] ?? '').replace(/\/$/, '') || '/';
    const isSemoPath = (v: string) => isSemoBoxSubmenuPath(pathOnly(v));

    if (!semoSiblingPopGuardRef.current && navigationType === 'POP' && isSemoPath(prev) && isSemoPath(current) && prev !== current) {
      semoSiblingPopGuardRef.current = true;
      navigate(prev, { replace: true });
      return;
    }

    semoSiblingPopGuardRef.current = false;
    prevPathRef.current = current;
  }, [location.pathname, location.search, navigationType, navigate]);

  useEffect(() => {
    if (!cartPopoverOpen) {
      cartContentSigRef.current = null;
      cartDismissGuardRef.current = false;
      return;
    }
    const sig = `${items.length}:${totalCount}`;
    if (cartContentSigRef.current === null) {
      cartContentSigRef.current = sig;
      return;
    }
    if (cartContentSigRef.current !== sig) {
      cartContentSigRef.current = sig;
      cartDismissGuardRef.current = true;
      const id = window.setTimeout(() => {
        cartDismissGuardRef.current = false;
      }, 500);
      return () => window.clearTimeout(id);
    }
  }, [items.length, totalCount, cartPopoverOpen]);

  // 장바구니 팝오버/시트 바깥 클릭 시 닫기 (모바일 딤은 별도 onClick)
  useEffect(() => {
    if (!cartPopoverOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (cartDismissGuardRef.current) return;
      const t = e.target as Node;
      if (cartDesktopRef.current?.contains(t)) return;
      if (cartMobileRef.current?.contains(t)) return;
      setCartPopoverOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onDocClick);
    };
  }, [cartPopoverOpen]);

  // 데스크톱만: 알림 패널 바깥 클릭 시 닫기 (모바일은 기존 오버레이로 처리)
  useEffect(() => {
    if (!notificationOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) return;
      const t = e.target as Node;
      if (notificationDesktopRef.current?.contains(t)) return;
      setNotificationOpen(false);
    };
    const timer = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', onDocClick);
    };
  }, [notificationOpen]);

  // SEMO Box: 데스크톱 — 외부 클릭 시 닫기 (헤더 트리거 + 하단 서브바는 안쪽)
  useEffect(() => {
    if (!semoBoxOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (semoBoxDesktopRef.current?.contains(t)) return;
      if (semoBoxSubbarRef.current?.contains(t)) return;
      setSemoBoxOpen(false);
      setSemoBoxPinned(false);
    };
    const timer = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', onDocClick); };
  }, [semoBoxOpen]);

  // 타이머 클린업
  useEffect(() => {
    return () => { if (semoBoxCloseTimer.current) clearTimeout(semoBoxCloseTimer.current); };
  }, []);

  // 라우트 변경 시 SEMO Box 드롭다운 닫기
  useEffect(() => {
    setSemoBoxOpen(false);
    setSemoBoxPinned(false);
  }, [location.pathname]);

  /** 장바구니 미리보기 패널 — 데스크톱(헤더) / 모바일(시트) 공용 내용 */
  const cartPanelInner = (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">{t(language, 'navbar', 'cart')}</p>
        <button
          type="button"
          onClick={() => setCartPopoverOpen(false)}
          aria-label={t(language, 'navbar', 'close')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">{t(language, 'navbar', 'cartEmpty')}</p>
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                {/* Cart.tsx 모바일과 동일: 사진(좌) | 제목 → 수량(좌)+가격(우, clamp) — 상품명·이미지 클릭 시 상세 */}
                <div className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-2">
                  <Link
                    to={`/product/${it.id}`}
                    className="contents"
                    onClick={() => setCartPopoverOpen(false)}
                  >
                    <div className="row-span-2 flex h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
                      {it.imageUrl ? (
                        <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">Слот</span>
                      )}
                    </div>
                    <p className="min-w-0 text-sm font-medium leading-snug text-slate-900 line-clamp-2">{it.name}</p>
                  </Link>
                  <div className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        aria-label="Уменьшить"
                        onClick={() => updateQuantity(it.id, it.quantity - 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm tabular-nums">{it.quantity}</span>
                      <button
                        type="button"
                        aria-label="Увеличить"
                        onClick={() => updateQuantity(it.id, it.quantity + 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
                      >
                        +
                      </button>
                    </div>
                    <div className="min-w-0 max-w-[min(100%,11.5rem)] shrink text-right leading-tight">
                      {it.originalPrice != null && it.originalPrice > 0 && (
                        <p className="text-slate-400 line-through tabular-nums [font-size:clamp(0.625rem,2.6vw,0.8125rem)] [line-height:1.15]">
                          {formatPrice(it.originalPrice * it.quantity, currency)}
                        </p>
                      )}
                      <p className="font-semibold tabular-nums text-slate-900 [font-size:clamp(0.6875rem,3.1vw,0.9375rem)] [line-height:1.2]">
                        {formatPrice(it.price * it.quantity, currency)}
                      </p>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {items.length > 0 && (
        <div className="shrink-0 border-t border-slate-100 px-4 py-3">
          <p className="mb-3 text-right text-base font-semibold text-slate-900">{t(language, 'navbar', 'total')}: {formatPrice(total, currency)}</p>
          <div className="flex flex-row gap-2">
            <Link
              to="/cart"
              onClick={() => setCartPopoverOpen(false)}
              className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white py-2.5 text-center text-xs font-medium text-slate-700 transition-colors hover:border-brand hover:text-brand hover:bg-brand-soft/20 sm:text-sm"
            >
              {t(language, 'navbar', 'goCart')}
            </Link>
            <Link
              to="/checkout"
              onClick={() => setCartPopoverOpen(false)}
              className="min-w-0 flex-1 rounded-full bg-brand py-2.5 text-center text-xs font-medium text-white hover:bg-brand/90 sm:text-sm"
            >
              {t(language, 'navbar', 'checkout')}
            </Link>
          </div>
        </div>
      )}
    </>
  );

  /**
   * 모바일 고정 서브바 한 줄 — flex 가중치 + 일부 항목 translate-x.
   * 글자: clamp 전 구간 +1pt (min / vw중간 / max).
   */
  const mobileSemoSubmenuRowEl = (
    <div className="flex w-full min-w-0 items-stretch gap-x-0 px-0">
      {SEMO_BOX_SUBMENU.map((sub) => {
        const line = sub.shortLabel ?? sub.label;
        const ariaWhenShort = sub.shortLabel != null && sub.shortLabel !== sub.label ? sub.label : undefined;
        return (
          <NavLink
            key={sub.to}
            to={sub.to}
            replace
            aria-label={ariaWhenShort}
            className={({ isActive }) =>
              // /product 에서는 현재 상품이 속한 catalog 탭을 active로 유지
              ((isActive || (isProductDetailPath && productCatalogSubmenuPath === sub.to))
                ? `flex ${mobileSemoSubnavCellFlex(sub.to)} items-center justify-center self-stretch overflow-visible px-0 py-1 text-center font-semibold leading-tight tracking-normal transition-colors ` +
                  `text-[length:clamp(calc(12px+1pt),calc(2vw+3pt),calc(15px+1pt))] text-brand`
                : `flex ${mobileSemoSubnavCellFlex(sub.to)} items-center justify-center self-stretch overflow-visible px-0 py-1 text-center font-semibold leading-tight tracking-normal transition-colors ` +
                  `text-[length:clamp(calc(12px+1pt),calc(2vw+3pt),calc(15px+1pt))] text-slate-600 active:bg-slate-100`) +
              ` ${mobileSemoSubnavLabelShift(sub.to)}`
            }
          >
            <span className="block min-w-0 max-w-full truncate text-center">{line}</span>
          </NavLink>
        );
      })}
    </div>
  );

  /** 모바일 팝오버(장바구니·알림) 시작 세로 위치 — /shop·/product 상단 서브 병합 시 바 높이에 맞춤 */
  const mobilePopoverTopClass = isMobileSemoSubnavMerged
    ? 'top-[calc(max(0.2rem,env(safe-area-inset-top,0px))+var(--semo-mobile-box-subnav-h))]'
    : 'top-[var(--semo-mobile-header-h)]';

  return (
    <>
      {/* 웹: 로고(좌) · 가운데 텍스트 메뉴 · 우측 아이콘(장바구니·알림·Telegram·프로필). 모바일: 로고만 가운데 */}
      {/* 모바일: 상품 상세 스크롤 미니바가 켜지면 이 헤더 숨김 — 미니바가 동일 위치 대체 */}
      <header
        className={`fixed left-0 right-0 top-0 z-40 w-full border-b ${
          productDesktopNav?.compact
            ? 'border-slate-200/90 bg-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : isMobileSemoSubnavMerged
              ? // 모바일 /shop·/product: 서브바와 동일 투명도·블러 · md+는 기존 헤더 톤
                'border-slate-200/60 bg-white/90 backdrop-blur-md md:border-slate-100 md:bg-white/80 md:backdrop-blur-md'
              : // 모바일+SEMO Box 구간: 상단은 불투명 흰색 · 데스크톱은 기존 반투명+블러
                `border-slate-100 bg-white/80 backdrop-blur-md ${
                  isSemoBoxActive ? 'max-md:bg-white max-md:backdrop-blur-none' : ''
                }`
        } ${productStickyReplacesNav ? 'max-md:hidden' : ''} md:fixed md:z-40`}
      >
        <div
          className={`relative mx-auto flex w-full min-w-0 max-w-7xl px-4 ${
            isMobileSemoSubnavMerged
              ? 'min-h-[var(--semo-mobile-box-subnav-h)] items-stretch md:h-[3.2rem] md:min-h-0 md:items-center'
              : 'h-11 items-center sm:h-[3.2rem]'
          }`}
          style={{ paddingTop: 'max(0.2rem, env(safe-area-inset-top))' }}
        >
          {/* md+ 컴팩트: 상세 본문과 동일 — 뷰포트 가운데 max-w-3xl 열 안에 가격(중앙) + В корзину(열 오른쪽) */}
          {productDesktopNav?.compact && (
            <div className="pointer-events-none absolute inset-0 z-[15] hidden justify-center px-4 sm:px-6 md:flex">
              <div className="pointer-events-auto relative flex h-full w-full max-w-3xl items-center">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative inline-flex max-w-[min(66vw,26rem)] items-center gap-[27px]">
                    {productDesktopNav.thumbUrl ? (
                      <div className="h-8 w-8 shrink-0 -translate-x-1 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                        <img src={productDesktopNav.thumbUrl} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : null}
                    <div className="inline-flex max-w-[min(58vw,22rem)] items-center gap-1.5 sm:gap-2">
                    {productDesktopNav.rrp != null &&
                      productDesktopNav.prp != null &&
                      productDesktopNav.rrp !== productDesktopNav.prp && (
                        <span className="max-w-[28vw] truncate text-left text-xs tabular-nums text-slate-500 line-through sm:max-w-none sm:text-sm sm:whitespace-nowrap">
                          {formatPrice(productDesktopNav.rrp, currency)}
                        </span>
                      )}
                    <span className="block min-w-0 max-w-[42vw] truncate text-left text-sm font-semibold tabular-nums text-slate-900 sm:max-w-[min(50vw,16rem)] sm:text-base">
                      {formatPrice(productDesktopNav.prp ?? productDesktopNav.rrp ?? 0, currency)}
                    </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => productDesktopNav?.onAddToCart()}
                  className="relative z-[2] ml-auto mr-[15%] shrink-0 rounded-full bg-brand px-2.5 py-1.5 text-[10px] font-semibold leading-tight text-white transition hover:bg-brand/90 sm:px-3 sm:py-2 sm:text-xs"
                >
                  В корзину
                </button>
              </div>
            </div>
          )}

          {/* 모바일: /shop·/shop/*·/product/* 는 로고 대신 서브메뉴 한 줄(고정 서브바와 동일 마크업) · 그 외는 SEMO box 로고 */}
          {isMobileSemoSubnavMerged ? (
            <div
              className="relative flex w-full min-h-[var(--semo-mobile-box-subnav-h)] items-stretch -mx-4 px-0 md:hidden"
              aria-label="SEMO Box"
            >
              {mobileSemoSubmenuRowEl}
            </div>
          ) : (
            <div className="flex w-full flex-1 items-center justify-center md:hidden">
              <Link to="/" className="flex shrink-0 items-center" aria-label="SEMO box">
                <span className="font-semibold tracking-[0.2em] text-brand">SEMO </span>
                <span className="font-semibold tracking-[0.2em] text-slate-700">box</span>
              </Link>
            </div>
          )}

          {/* md+: 로고 | 가운데(텍스트 메뉴 또는 상품 가격+В корзину) | 아이콘 */}
          <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
            <Link to="/" className="relative z-20 flex shrink-0 items-center" aria-label="SEMO box">
              <span className="font-semibold tracking-[0.2em] text-brand">SEMO </span>
              <span className="font-semibold tracking-[0.2em] text-slate-700">box</span>
            </Link>
            {/* flex-1 + justify-center 만 쓰면 우측 툴바가 넓어 메뉴가 왼쪽으로 치우침 — translate-x 로 보정(값 키우면 언어·화폐 버튼과 간격 축소) */}
            <div className="flex min-w-0 flex-1 items-center justify-center px-1">
              {!productDesktopNav?.compact ? (
                <nav
                  className="flex min-w-0 max-w-[min(100%,52rem)] flex-wrap items-center justify-center gap-x-9 gap-y-2 text-sm md:translate-x-[4.5vw]"
                  aria-label="Main"
                >
                  <NavLink
                    to="/about"
                    className={({ isActive }) =>
                      `${navLinkBase} whitespace-nowrap ${isActive ? activeClass : inactiveClass}`
                    }
                  >
                    About SEMO
                  </NavLink>
                  <NavLink
                    to="/journey"
                    className={({ isActive }) =>
                      `${navLinkBase} whitespace-nowrap ${isActive ? activeClass : inactiveClass}`
                    }
                  >
                    Journey to SEMO
                  </NavLink>
                  {/* SEMO Box — 호버·클릭 시 하단 서브바만 표시 (/shop 등으로 이동하지 않음) */}
                  <div
                    ref={semoBoxDesktopRef}
                    className="relative flex items-center"
                    onMouseEnter={semoBoxEnter}
                    onMouseLeave={semoBoxLeave}
                  >
                    <button
                      type="button"
                      aria-expanded={semoBoxOpen}
                      aria-haspopup="true"
                      aria-controls="semo-box-subnav"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!semoBoxOpen) {
                          setSemoBoxPinned(true);
                          setSemoBoxOpen(true);
                          return;
                        }
                        if (semoBoxPinned) {
                          setSemoBoxPinned(false);
                          setSemoBoxOpen(false);
                          return;
                        }
                        setSemoBoxPinned(true);
                      }}
                      className={`${navLinkBase} whitespace-nowrap ${
                        isSemoBoxActive ? activeClass : inactiveClass
                      }`}
                    >
                      SEMO Box
                    </button>
                  </div>
                  <NavLink
                    to="/support"
                    className={({ isActive }) =>
                      `${navLinkBase} whitespace-nowrap ${isActive ? activeClass : inactiveClass}`
                    }
                  >
                    FAQ
                  </NavLink>
                </nav>
              ) : (
                /* 컴팩트 시 가격·CTA는 absolute 오버레이(본문 max-w-3xl 열 정렬) — 여기는 레이아웃용 빈 칸 */
                <div className="min-h-[2.75rem] w-full min-w-0" aria-hidden />
              )}
            </div>
            {/* 데스크톱: 유틸 — 언어·화폐 왼쪽에 큰 고정 마진 없음(gap-3은 로고·가운데·이 그룹 사이 공통 간격) */}
            <div className="relative z-20 flex min-w-0 shrink-0 items-center gap-2">
            <div className="flex items-center gap-1 pr-0.5">
              <div ref={langMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setCurrencyMenuOpen(false);
                    setLangMenuOpen((v) => !v);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-brand/40 hover:bg-slate-50"
                  aria-label={t(language, 'navbar', 'language')}
                  aria-expanded={langMenuOpen}
                >
                  <span className="inline-flex flex-col items-center leading-none">
                    <span aria-hidden className="text-[15px]">{language === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
                    <span className="mt-0.5 text-[9px] font-semibold">{language.toUpperCase()}</span>
                  </span>
                </button>
                {langMenuOpen && (
                  <div className="absolute left-1/2 top-full z-50 mt-1 max-h-36 w-20 -translate-x-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    {[
                      { code: 'ru', flag: '🇷🇺', label: 'RU' },
                      { code: 'en', flag: '🇬🇧', label: 'EN' },
                    ].map((l) => (
                      <button
                        key={l.code}
                        type="button"
                        onClick={() => {
                          setLanguage(l.code as 'ru' | 'en');
                          setLangMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                          language === l.code ? 'bg-brand-soft/40 text-brand' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span aria-hidden>{l.flag}</span>
                        <span>{l.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div ref={currencyMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setLangMenuOpen(false);
                    setCurrencyMenuOpen((v) => !v);
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-brand/40 hover:bg-slate-50"
                  aria-label={t(language, 'navbar', 'currency')}
                  aria-expanded={currencyMenuOpen}
                >
                  <span className="inline-flex flex-col items-center leading-none">
                    <span aria-hidden className="text-[15px]">
                      {currency === 'RUB'
                        ? '🇷🇺'
                        : currency === 'UZS'
                          ? '🇺🇿'
                          : currency === 'KZT'
                            ? '🇰🇿'
                            : '🇺🇸'}
                    </span>
                    <span className="mt-0.5 text-[8px] font-semibold">{currency}</span>
                  </span>
                </button>
                {currencyMenuOpen && (
                  <div className="absolute left-1/2 top-full z-50 mt-1 max-h-44 w-[5.6rem] -translate-x-1/2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    {[
                      { code: 'RUB', flag: '🇷🇺', label: 'RUB' },
                      { code: 'KZT', flag: '🇰🇿', label: 'KZT' },
                      { code: 'UZS', flag: '🇺🇿', label: 'UZS' },
                      { code: 'USD', flag: '🇺🇸', label: 'USD' },
                    ].map((c) => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => {
                          setCurrency(c.code as 'RUB' | 'USD' | 'KZT' | 'UZS');
                          setCurrencyMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                          currency === c.code ? 'bg-brand-soft/40 text-brand' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span aria-hidden>{c.flag}</span>
                        <span>{c.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div ref={cartDesktopRef} className="relative">
              <button
                type="button"
                aria-label={t(language, 'navbar', 'cart')}
                onClick={() => {
                  setNotificationOpen(false);
                  setCartPopoverOpen((v) => !v);
                }}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-brand/40 hover:bg-brand-soft/15 ${
                  isCartActive ? 'border-brand/50 bg-brand-soft/25 text-brand' : ''
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {totalCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold leading-none text-white">
                    {totalCount > 99 ? '99+' : totalCount}
                  </span>
                )}
              </button>
              {cartPopoverOpen && (
                <div
                  className={`fixed left-1/2 z-50 flex min-h-[13rem] max-h-[min(72vh,calc(100vh-5rem))] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:left-auto md:right-4 md:top-[var(--semo-desktop-header-h)] md:translate-x-0 ${mobilePopoverTopClass}`}
                >
                  {cartPanelInner}
                </div>
              )}
            </div>

            <div ref={notificationDesktopRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setCartPopoverOpen(false);
                  setMobileMenuOpen(false);
                  setNotificationOpen((v) => !v);
                }}
                aria-label={
                  isLoggedIn && unreadCount > 0
                    ? `${t(language, 'navbar', 'notifications')}, unread: ${unreadCount}`
                    : t(language, 'navbar', 'notifications')
                }
                className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-700 transition hover:border-brand/40 hover:bg-brand-soft/15 ${
                  isNotificationActive ? 'border-brand/50 bg-brand-soft/25 text-brand' : ''
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3a4 4 0 0 0-4 4v2.09c0 .46-.16.91-.46 1.26L6.3 12.76A2 2 0 0 0 6 14v1h12v-1a2 2 0 0 0-.3-1.24l-1.24-1.41A2 2 0 0 1 16 9.09V7a4 4 0 0 0-4-4z" />
                  <path d="M10 18a2 2 0 0 0 4 0" />
                </svg>
                {isLoggedIn && unreadCount > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white"
                    aria-hidden
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              {notificationOpen && (
                <div
                  className={`fixed left-1/2 z-50 flex max-h-[min(72vh,calc(100vh-5rem))] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:left-auto md:right-4 md:top-[var(--semo-desktop-header-h)] md:translate-x-0 ${mobilePopoverTopClass}`}
                >
                  <div className="relative shrink-0 border-b border-slate-100 px-4 py-3 pr-12">
                    <p className="text-sm font-semibold text-slate-800">{t(language, 'navbar', 'notifications')}</p>
                    {isLoggedIn && unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={markAllNotificationsRead}
                        className="mt-1 text-left text-xs font-medium text-brand hover:underline"
                      >
                        {t(language, 'navbar', 'readAll')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setNotificationOpen(false)}
                      aria-label={t(language, 'navbar', 'close')}
                      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                    {!isLoggedIn && (
                      <p className="py-8 text-center text-sm text-slate-500">{t(language, 'navbar', 'loginForNotifications')}</p>
                    )}
                    {isLoggedIn && notificationRows.length === 0 && (
                      <p className="py-8 text-center text-sm text-slate-500">{t(language, 'navbar', 'notificationsEmpty')}</p>
                    )}
                    {isLoggedIn && notificationRows.length > 0 && (
                      <ul className="space-y-3">
                        {notificationRows.map((n) => (
                          <li
                            key={n.id}
                            role={n.href ? 'button' : undefined}
                            tabIndex={n.href ? 0 : undefined}
                            onClick={() => {
                              if (n.href) openNotificationTarget(n);
                            }}
                            onKeyDown={(e) => {
                              if (!n.href) return;
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openNotificationTarget(n);
                              }
                            }}
                            className={`rounded-xl border p-3 text-left transition ${
                              n.unread
                                ? 'border-l-4 border-l-brand border-slate-100 bg-brand-soft/25'
                                : 'border-slate-100 bg-slate-50/80'
                            } ${n.href ? 'cursor-pointer hover:bg-slate-100/90' : ''}`}
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {n.kindLabel}
                              </span>
                              <div className="flex shrink-0 items-center gap-1">
                                <span className="text-xs text-slate-400 tabular-nums">{n.date}</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteNotification(n.id);
                                  }}
                                  aria-label={t(language, 'navbar', 'delete')}
                                  className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                                >
                                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <p className="text-sm font-medium text-slate-900">{n.title}</p>
                            {n.body ? <p className="mt-1 text-sm leading-snug text-slate-700">{n.body}</p> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </div>

            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/90 bg-white transition hover:border-slate-300 hover:bg-slate-50 ${
                telegramLinkedNav === true ? 'text-[#26A5E4]' : 'text-slate-900'
              }`}
              aria-label="Telegram"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </a>

            <Link
              to={isLoggedIn ? '/profile' : '/login'}
              aria-label={isLoggedIn ? t(language, 'navbar', 'profile') : t(language, 'navbar', 'account')}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border bg-white transition hover:border-brand/40 hover:bg-brand-soft/15 ${
                isProfileActive
                  ? isLoggedIn
                    ? 'border-[#0088cc] bg-[#0088cc]/10 text-[#0088cc]'
                    : 'border-brand/50 bg-brand-soft/25 text-brand'
                  : isLoggedIn
                    ? 'border-[#0088cc]/60 text-[#0088cc]'
                    : 'border-slate-200/90 text-slate-700'
              }`}
            >
              {isLoggedIn && skinReminderCount > 0 && (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold leading-none text-white">
                  {skinReminderCount > 9 ? '9+' : skinReminderCount}
                </span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="9" r="3.5" />
                <path d="M6 19.5c1.4-2.3 3.3-3.5 6-3.5s4.6 1.2 6 3.5" />
              </svg>
            </Link>
          </div>
        </div>
        </div>
      </header>

      {/* 모바일: SEMO Box 하위 — 헤더 아래 고정 서브바(/shop·/product 는 위에서 병합되어 여기 생략) */}
      {isSemoBoxActive && !productStickyReplacesNav && !isMobileSemoSubnavMerged && (
        <nav
          className="fixed left-0 right-0 z-[38] -mt-px flex min-h-[var(--semo-mobile-box-subnav-h)] items-stretch border-b border-slate-200/60 bg-white/90 backdrop-blur-md md:hidden"
          style={{ top: 'var(--semo-mobile-header-h)' }}
          aria-label="SEMO Box"
        >
          {mobileSemoSubmenuRowEl}
        </nav>
      )}

      {/* SEMO Box 서브 네비게이션 바 — 데스크톱: 호버 시 표시, 상단바 바로 아래 횡 메뉴 (틈 없이 경계선만) */}
      {semoBoxOpen && !productDesktopNav?.compact && (
        <div
          id="semo-box-subnav"
          ref={semoBoxSubbarRef}
          className="fixed left-0 right-0 z-[39] hidden -mt-px border-b border-slate-200/60 bg-white/75 backdrop-blur-md md:block"
          style={{ top: 'var(--semo-desktop-header-h, 3.2rem)' }}
          onMouseEnter={semoBoxEnter}
          onMouseLeave={semoBoxLeave}
        >
          <nav className="mx-auto flex max-w-7xl items-center justify-center gap-x-8 px-4 py-[calc(0.5rem+0.5vw)] lg:gap-x-12">
            {SEMO_BOX_SUBMENU.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                replace
                onClick={() => {
                  setSemoBoxOpen(false);
                  setSemoBoxPinned(false);
                }}
                className={({ isActive }) =>
                  `whitespace-nowrap text-sm transition-colors ${
                    isActive
                      ? 'font-semibold text-brand'
                      : 'text-slate-600 hover:text-brand'
                  }`
                }
              >
                {sub.label}
              </NavLink>
            ))}
          </nav>
        </div>
      )}

      {/* 모바일: 하단 탭 장바구니 — 팝업 시트 (스크롤·내용 잘림 방지) */}
      {cartPopoverOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
            onClick={() => {
              if (cartDismissGuardRef.current) return;
              setCartPopoverOpen(false);
            }}
          />
          <div
            ref={cartMobileRef}
            className="fixed left-2 right-2 z-50 flex min-h-[13rem] max-h-[min(75vh,32rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:hidden"
            style={{ bottom: 'var(--semo-mobile-tabbar-h)' }}
          >
            {cartPanelInner}
          </div>
        </>
      )}

      {/* 모바일: 알림 패널 — 장바구니 팝업과 동일 스타일 (하단 시트) */}
      {notificationOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
            onClick={() => {
              setNotificationOpen(false);
            }}
          />
          <div
            className="fixed left-2 right-2 z-50 flex max-h-[min(75vh,32rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:hidden"
            style={{ bottom: 'var(--semo-mobile-tabbar-h)' }}
          >
            <div className="relative shrink-0 border-b border-slate-100 px-4 py-3 pr-12">
              <p className="text-sm font-semibold text-slate-800">{t(language, 'navbar', 'notifications')}</p>
              {isLoggedIn && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllNotificationsRead}
                  className="mt-1 text-left text-xs font-medium text-brand hover:underline"
                >
                  Прочитать все
                </button>
              )}
              <button
                type="button"
                onClick={() => setNotificationOpen(false)}
                aria-label={t(language, 'navbar', 'close')}
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              {!isLoggedIn && (
                <p className="py-8 text-center text-sm text-slate-500">{t(language, 'navbar', 'loginForNotifications')}</p>
              )}
              {isLoggedIn && notificationRows.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">{t(language, 'navbar', 'notificationsEmpty')}</p>
              )}
              {isLoggedIn && notificationRows.length > 0 && (
                <ul className="space-y-3">
                  {notificationRows.map((n) => (
                    <li
                      key={n.id}
                      role={n.href ? 'button' : undefined}
                      tabIndex={n.href ? 0 : undefined}
                      onClick={() => {
                        if (n.href) openNotificationTarget(n);
                      }}
                      onKeyDown={(e) => {
                        if (!n.href) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openNotificationTarget(n);
                        }
                      }}
                      className={`rounded-xl border p-3 text-left transition ${
                        n.unread
                          ? 'border-l-4 border-l-brand border-slate-100 bg-brand-soft/25'
                          : 'border-slate-100 bg-slate-50/80'
                      } ${n.href ? 'cursor-pointer hover:bg-slate-100/90' : ''}`}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {n.kindLabel}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className="text-xs text-slate-400 tabular-nums">{n.date}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void deleteNotification(n.id);
                            }}
                            aria-label={t(language, 'navbar', 'delete')}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-slate-900">{n.title}</p>
                      {n.body ? <p className="mt-1 text-sm leading-snug text-slate-700">{n.body}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {/* 모바일 전용: 하단 고정 바 — 메뉴 | 홈 | 뷰티박스 | 알림 | … */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-evenly border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingTop: '0.125rem', paddingBottom: 'max(0.2rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => {
            setMobileMenuOpen(true);
          }}
          aria-label={t(language, 'navbar', 'openMenu')}
          className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-full px-1 transition sm:px-2 ${
            isMenuActive ? 'text-brand' : 'text-slate-600'
          }`}
        >
          <svg className={MOBILE_TAB_ICON} fill="none" stroke="currentColor" strokeWidth={isMenuActive ? MOBILE_TAB_STROKE.on : MOBILE_TAB_STROKE.off} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link
          to="/"
          aria-label={t(language, 'navbar', 'home')}
          onClick={(e) => {
            setMobileMenuOpen(false);
            setNotificationOpen(false);
            setCartPopoverOpen(false);
            if (e.metaKey || e.ctrlKey || e.button === 1) return;
            if (location.pathname === '/') {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
              return;
            }
            e.preventDefault();
            void navigate('/');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              });
            });
          }}
          className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-full px-1 transition sm:px-2 ${
            isHomeActive ? 'text-brand' : 'text-slate-600 hover:text-brand'
          }`}
        >
          <svg className={MOBILE_TAB_ICON} fill="none" stroke="currentColor" strokeWidth={isHomeActive ? MOBILE_TAB_STROKE.on : MOBILE_TAB_STROKE.off} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z" />
          </svg>
        </Link>
        <Link
          to="/shop"
          aria-label={t(language, 'navbar', 'catalogBeautyBox')}
          onClick={() => {
            setMobileMenuOpen(false);
            setNotificationOpen(false);
            setCartPopoverOpen(false);
          }}
          className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-full px-1 transition sm:px-2 ${
            isShopTabActive ? 'text-brand' : 'text-slate-600 hover:text-brand'
          }`}
        >
          {/* 패키지/박스 아이콘 — 뷰티박스 카탈로그 진입 */}
          <svg
            className={`${MOBILE_TAB_ICON} origin-center scale-[1.04]`}
            fill="none"
            stroke="currentColor"
            strokeWidth={isShopTabActive ? MOBILE_TAB_STROKE.on : MOBILE_TAB_STROKE.off}
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
        </Link>
        <button
          type="button"
          onClick={() => {
            setCartPopoverOpen(false);
            setMobileMenuOpen(false);
            setNotificationOpen((v) => !v);
          }}
          aria-label={
            isLoggedIn && unreadCount > 0
              ? `${t(language, 'navbar', 'notifications')}, unread: ${unreadCount}`
              : t(language, 'navbar', 'notifications')
          }
          className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-full px-1 transition sm:px-2 ${
            isNotificationActive ? 'text-brand' : 'text-slate-600 hover:text-brand'
          }`}
        >
          <span className={MOBILE_TAB_ICON_WRAP}>
            <svg viewBox="0 0 24 24" className={`${MOBILE_TAB_ICON} origin-center scale-[1.04]`} fill="none" stroke="currentColor" strokeWidth={isNotificationActive ? MOBILE_TAB_STROKE.on : MOBILE_TAB_STROKE.off}>
              <path d="M12 3a4 4 0 0 0-4 4v2.09c0 .46-.16.91-.46 1.26L6.3 12.76A2 2 0 0 0 6 14v1h12v-1a2 2 0 0 0-.3-1.24l-1.24-1.41A2 2 0 0 1 16 9.09V7a4 4 0 0 0-4-4z" />
              <path d="M10 18a2 2 0 0 0 4 0" />
            </svg>
            {isLoggedIn && unreadCount > 0 && (
              <span
                className="absolute -right-1.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold leading-none text-white ring-1 ring-white"
                aria-hidden
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label={t(language, 'navbar', 'cart')}
          onClick={() => {
            setNotificationOpen(false);
            setCartPopoverOpen((v) => !v);
          }}
          className={`flex h-9 min-w-0 flex-1 items-center justify-center rounded-full px-1 transition sm:px-2 ${
            isCartActive ? 'text-brand' : 'text-slate-600'
          }`}
        >
          <span className={MOBILE_TAB_ICON_WRAP}>
            <svg viewBox="0 0 24 24" className={`${MOBILE_TAB_ICON} origin-center scale-[0.92]`} fill="none" stroke="currentColor" strokeWidth={isCartActive ? MOBILE_TAB_STROKE.on : MOBILE_TAB_STROKE.off}>
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            {totalCount > 0 && (
              <span className="absolute -right-1.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-brand px-0.5 text-[9px] font-semibold leading-none text-white ring-1 ring-white">
                {totalCount > 99 ? '99+' : totalCount}
              </span>
            )}
          </span>
        </button>
        <Link
          to={isLoggedIn ? '/profile' : '/login'}
          aria-label={isLoggedIn ? t(language, 'navbar', 'profile') : t(language, 'navbar', 'account')}
          className="flex h-9 min-w-0 flex-1 items-center justify-center px-1 transition sm:px-2"
        >
          {/* 사람 아이콘에 맞춘 작은 원 — border-2·큰 박스 대신 얇은 링 + 타이트한 크기 */}
          <span
            className={`inline-flex ${MOBILE_TAB_PROFILE_RING} shrink-0 items-center justify-center rounded-full ${
              isLoggedIn
                ? isProfileActive
                  ? 'border border-[#0088cc] bg-[#0088cc]/10 text-[#0088cc]'
                  : 'border border-[#0088cc]/80 text-[#0088cc]'
                : isProfileActive
                  ? 'text-brand'
                  : 'text-slate-600'
            }`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className={MOBILE_TAB_PROFILE_SVG}
              fill="none"
              stroke="currentColor"
              strokeWidth={isProfileActive ? MOBILE_TAB_STROKE.on : MOBILE_TAB_STROKE.off}
            >
              <circle cx="12" cy="9" r="3.5" />
              <path d="M6 19.5c1.4-2.3 3.3-3.5 6-3.5s4.6 1.2 6 3.5" />
            </svg>
          </span>
        </Link>
      </nav>

      {/* 모바일 빠른 언어/통화 버튼: 햄버거를 열지 않아도 바로 변경 가능 */}
      {!mobileLocaleQuickDismissed && (
      <div className="fixed bottom-[calc(var(--semo-mobile-tabbar-h)+0.5rem)] right-3 z-40 md:hidden">
        <button
          type="button"
          onClick={() => setMobileLocaleQuickOpen((v) => !v)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 text-[10px] font-semibold text-slate-700 shadow-sm"
          aria-label="Quick language and currency"
          aria-expanded={mobileLocaleQuickOpen}
        >
          <span aria-hidden>{language === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
          <span>{language.toUpperCase()}</span>
          <span className="text-slate-300">|</span>
          <span>{currency}</span>
        </button>
        {mobileLocaleQuickOpen && (
          <div className="absolute bottom-full right-0 mb-2 w-40 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t(language, 'navbar', 'language')}
            </p>
            <div className="mb-2 grid grid-cols-2 gap-1">
              {[
                { code: 'ru', flag: '🇷🇺', label: 'RU' },
                { code: 'en', flag: '🇬🇧', label: 'EN' },
              ].map((l) => (
                <button
                  key={l.code}
                  type="button"
                  onClick={() => {
                    setLanguage(l.code as 'ru' | 'en');
                    setMobileLocaleQuickDismissed(true);
                    try {
                      localStorage.setItem('semo_mobile_locale_quick_dismissed', '1');
                    } catch {
                      /* ignore */
                    }
                    setMobileLocaleQuickOpen(false);
                  }}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                    language === l.code ? 'bg-brand-soft/40 text-brand' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {l.flag} {l.label}
                </button>
              ))}
            </div>
            <p className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {t(language, 'navbar', 'currency')}
            </p>
            <div className="grid grid-cols-2 gap-1">
                {[
                  { code: 'RUB', flag: '🇷🇺' },
                  { code: 'KZT', flag: '🇰🇿' },
                  { code: 'UZS', flag: '🇺🇿' },
                  { code: 'USD', flag: '🇺🇸' },
                ].map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => {
                      setCurrency(c.code as 'RUB' | 'USD' | 'KZT' | 'UZS');
                    setMobileLocaleQuickDismissed(true);
                    try {
                      localStorage.setItem('semo_mobile_locale_quick_dismissed', '1');
                    } catch {
                      /* ignore */
                    }
                    setMobileLocaleQuickOpen(false);
                  }}
                  className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                    currency === c.code ? 'bg-brand-soft/40 text-brand' : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {c.flag} {c.code}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* 모바일: 왼쪽 전체 메뉴 드로어 (햄버거 클릭 시) */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
            onClick={() => {
              setMobileMenuOpen(false);
              setMobileLocaleQuickOpen(false);
            }}
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 flex w-[14.4rem] max-w-[68vw] flex-col bg-white shadow-xl md:hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <span className="font-semibold tracking-wide text-slate-800">{t(language, 'navbar', 'menu')}</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label={t(language, 'navbar', 'closeMenu')}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-2 overflow-hidden p-3">
              <NavLink
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                }
              >
                About SEMO
              </NavLink>
              <NavLink
                to="/journey"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                }
              >
                Journey to SEMO
              </NavLink>
              {/* SEMO Box — 상단 행은 예전 접기 버튼과 동일 스타일, 하위는 항상 펼침(이전 펼친 상태와 동일) */}
              <div role="group" aria-label="SEMO Box">
                <div
                  className={`flex w-full items-center rounded-xl px-4 py-3 text-base ${
                    isSemoBoxActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'
                  }`}
                >
                  SEMO Box
                </div>
                <div className="ml-0 mt-1 flex flex-col gap-1 pl-3">
                  {SEMO_BOX_SUBMENU.map((sub) => (
                    <NavLink
                      key={sub.to}
                      to={sub.to}
                      replace
                      onClick={() => setMobileMenuOpen(false)}
                      className={({ isActive }) =>
                        `rounded-xl px-3 py-2.5 text-sm ${
                          isActive
                            ? 'bg-brand-soft/30 text-brand font-semibold'
                            : 'text-slate-600 font-medium'
                        }`
                      }
                    >
                      {sub.label}
                    </NavLink>
                  ))}
                </div>
              </div>
              <NavLink
                to="/support"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                }
              >
                FAQ
              </NavLink>
              <a
                href={telegramLinkedNav === true ? TELEGRAM_BOT_URL : undefined}
                target={telegramLinkedNav === true ? '_blank' : undefined}
                rel={telegramLinkedNav === true ? 'noopener noreferrer' : undefined}
                aria-disabled={telegramLinkedNav !== true}
                onClick={(e) => {
                  if (telegramLinkedNav !== true) e.preventDefault();
                  else setMobileMenuOpen(false);
                }}
                className={`-translate-y-[1vw] flex items-center gap-2 rounded-xl px-4 py-3 text-base font-medium ${
                  telegramLinkedNav === true
                    ? 'text-[#26A5E4] hover:bg-slate-50'
                    : 'cursor-not-allowed text-slate-400'
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                Telegram
              </a>
            </nav>
            <div className="border-t border-slate-100 px-3 py-2.5">
              <div className="flex items-center justify-center gap-2">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrencyMenuOpen(false);
                      setLangMenuOpen((v) => !v);
                    }}
                    className="inline-flex h-9 min-w-[4.3rem] items-center justify-center gap-1 rounded-full border border-slate-200/90 bg-white px-2 text-[11px] font-semibold text-slate-700 transition hover:border-brand/40"
                    aria-label={t(language, 'navbar', 'language')}
                    aria-expanded={langMenuOpen}
                  >
                    <span aria-hidden>{language === 'ru' ? '🇷🇺' : '🇬🇧'}</span>
                    <span>{language.toUpperCase()}</span>
                  </button>
                  {langMenuOpen && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 max-h-36 w-20 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      {[
                        { code: 'ru', flag: '🇷🇺', label: 'RU' },
                        { code: 'en', flag: '🇬🇧', label: 'EN' },
                      ].map((l) => (
                        <button
                          key={l.code}
                          type="button"
                          onClick={() => {
                            setLanguage(l.code as 'ru' | 'en');
                            setLangMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                            language === l.code ? 'bg-brand-soft/40 text-brand' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span aria-hidden>{l.flag}</span>
                          <span>{l.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setLangMenuOpen(false);
                      setCurrencyMenuOpen((v) => !v);
                    }}
                    className="inline-flex h-9 min-w-[5.1rem] items-center justify-center gap-1 rounded-full border border-slate-200/90 bg-white px-2 text-[11px] font-semibold text-slate-700 transition hover:border-brand/40"
                    aria-label={t(language, 'navbar', 'currency')}
                    aria-expanded={currencyMenuOpen}
                  >
                    <span aria-hidden>
                      {currency === 'RUB'
                        ? '🇷🇺'
                        : currency === 'UZS'
                          ? '🇺🇿'
                          : currency === 'KZT'
                            ? '🇰🇿'
                            : '🇺🇸'}
                    </span>
                    <span>{currency}</span>
                  </button>
                  {currencyMenuOpen && (
                    <div className="absolute bottom-full left-0 z-50 mb-1 max-h-44 w-[5.6rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      {[
                        { code: 'RUB', flag: '🇷🇺', label: 'RUB' },
                        { code: 'KZT', flag: '🇰🇿', label: 'KZT' },
                        { code: 'UZS', flag: '🇺🇿', label: 'UZS' },
                        { code: 'USD', flag: '🇺🇸', label: 'USD' },
                      ].map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setCurrency(c.code as 'RUB' | 'USD' | 'KZT' | 'UZS');
                            setCurrencyMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition ${
                            currency === c.code ? 'bg-brand-soft/40 text-brand' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span aria-hidden>{c.flag}</span>
                          <span>{c.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
};
