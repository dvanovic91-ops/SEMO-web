import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProductNavReplacement } from '../context/ProductNavReplacementContext';
import { supabase } from '../lib/supabase';
import { useCart } from '../context/CartContext';
import { useNotifications, type NotificationRow } from '../hooks/useNotifications';
import { notificationKindBadgeRu, resolveNotificationHref } from '../lib/notificationNavigation';
const navLinkBase =
  'text-sm tracking-wide transition-colors border-b-2 border-transparent pb-1';

const activeClass = 'text-brand border-brand font-semibold';
const inactiveClass = 'text-slate-900 hover:text-brand';

/** 텔레그램 봇 — 지원/поддержка 링크 */
const TELEGRAM_BOT_URL = 'https://t.me/My_SEMO_Beautybot';

const NAV_LINKS: { to: string; label: string }[] = [
  { to: '/about', label: 'About SEMO' },
  { to: '/journey', label: 'Journey to SEMO' },
  { to: '/support', label: 'FAQ' },
];

/** SEMO Box 하위 메뉴 (드롭다운) */
const SEMO_BOX_SUBMENU: { to: string; label: string }[] = [
  { to: '/skin-test', label: 'Find my box' },
  { to: '/shop', label: 'Beauty box' },
  { to: '/inner-beauty', label: 'Inner Beauty box' },
  { to: '/hair-beauty', label: 'Hair Beauty box' },
  { to: '/promo', label: 'Promo' },
];

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

function formatNotificationDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const Navbar: React.FC = () => {
  const { productStickyReplacesNav, productDesktopNav } = useProductNavReplacement();
  const location = useLocation();
  const navigate = useNavigate();
  const { items, total, totalCount, updateQuantity } = useCart();
  const { isLoggedIn, userId } = useAuth();
  /** true: аккаунт привязан к Telegram — иконка в шапке #26A5E4; иначе тёмная */
  const [telegramLinkedNav, setTelegramLinkedNav] = useState<boolean | null>(null);
  const { items: notificationItems, unreadCount, markAllRead, markNotificationRead, deleteNotification } =
    useNotifications(isLoggedIn ? userId : null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [semoBoxOpen, setSemoBoxOpen] = useState(false);
  const [mobileSemoBoxOpen, setMobileSemoBoxOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [cartPopoverOpen, setCartPopoverOpen] = useState(false);
  /** 모바일 하단바 맨 앞 샵 아이콘 — 한 열 메뉴 (다른 하단 버튼 누르면 닫힘) */
  const [mobileShopMenuOpen, setMobileShopMenuOpen] = useState(false);
  const semoBoxDesktopRef = useRef<HTMLDivElement>(null);
  const semoBoxCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** SEMO Box hover 영역 진입 — 타이머 취소 후 열기 */
  const semoBoxEnter = useCallback(() => {
    if (semoBoxCloseTimer.current) { clearTimeout(semoBoxCloseTimer.current); semoBoxCloseTimer.current = null; }
    setSemoBoxOpen(true);
  }, []);
  /** SEMO Box hover 영역 이탈 — 딜레이 후 닫기 (서브바로 이동 시 취소됨) */
  const semoBoxLeave = useCallback(() => {
    if (semoBoxCloseTimer.current) clearTimeout(semoBoxCloseTimer.current);
    semoBoxCloseTimer.current = setTimeout(() => { setSemoBoxOpen(false); semoBoxCloseTimer.current = null; }, 200);
  }, []);
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

  /** 라우트 이동 시 모바일 샵 팝업 닫기 */
  useEffect(() => {
    setMobileShopMenuOpen(false);
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

  const notificationRows = useMemo(
    () =>
      notificationItems.map((n: NotificationRow) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body ?? '',
        date: formatNotificationDate(n.created_at),
        unread: !n.read_at,
        kindLabel: notificationKindBadgeRu(n.kind, n.metadata),
        href: resolveNotificationHref(n.kind, n.metadata),
      })),
    [notificationItems],
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
  const isSemoBoxActive = SEMO_BOX_SUBMENU.some((l) => path === l.to || path.startsWith(l.to + '/'));
  const isShop = isSemoBoxActive;
  const isCartActive = path === '/cart' || cartPopoverOpen;
  const isNotificationActive = notificationOpen;
  const isProfileActive = path.startsWith('/profile') || path === '/login';
  const isMenuActive = NAV_LINKS.some((l) => (path === l.to || path.startsWith(l.to + '/')));

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

  // SEMO Box: 데스크톱 — 외부 클릭 시 닫기
  useEffect(() => {
    if (!semoBoxOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (semoBoxDesktopRef.current?.contains(t)) return;
      setSemoBoxOpen(false);
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
    setMobileSemoBoxOpen(false);
  }, [location.pathname]);

  /** 장바구니 미리보기 패널 — 데스크톱(헤더) / 모바일(시트) 공용 내용 */
  const cartPanelInner = (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-semibold text-slate-800">Корзина</p>
        <button
          type="button"
          onClick={() => setCartPopoverOpen(false)}
          aria-label="Закрыть"
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Пока пусто</p>
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
                          {formatPrice(it.originalPrice * it.quantity)}
                        </p>
                      )}
                      <p className="font-semibold tabular-nums text-slate-900 [font-size:clamp(0.6875rem,3.1vw,0.9375rem)] [line-height:1.2]">
                        {formatPrice(it.price * it.quantity)}
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
          <p className="mb-3 text-right text-base font-semibold text-slate-900">Итого: {formatPrice(total)}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              to="/cart"
              onClick={() => setCartPopoverOpen(false)}
              className="flex-1 rounded-full border border-slate-200 bg-white py-2.5 text-center text-sm font-medium text-slate-700 transition-colors hover:border-brand hover:text-brand hover:bg-brand-soft/20"
            >
              В корзину
            </Link>
            <Link
              to="/checkout"
              onClick={() => setCartPopoverOpen(false)}
              className="flex-1 rounded-full bg-brand py-2.5 text-center text-sm font-medium text-white hover:bg-brand/90"
            >
              Оформить заказ
            </Link>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* 웹: 로고(좌) · 가운데 텍스트 메뉴 · 우측 아이콘(장바구니·알림·Telegram·프로필). 모바일: 로고만 가운데 */}
      {/* 모바일: 상품 상세 스크롤 미니바가 켜지면 이 헤더 숨김 — 미니바가 동일 위치 대체 */}
      <header
        className={`fixed left-0 right-0 top-0 z-40 w-full border-b ${
          productDesktopNav?.compact
            ? 'border-slate-200/90 bg-white shadow-[0_4px_14px_-4px_rgba(0,0,0,0.1),0_2px_6px_-2px_rgba(0,0,0,0.06)]'
            : 'border-slate-100 bg-white/80 backdrop-blur-md'
        } ${productStickyReplacesNav ? 'max-md:hidden' : ''} md:fixed md:z-40`}
      >
        <div
          className="relative mx-auto flex h-11 w-full min-w-0 max-w-7xl items-center px-4 sm:h-[3.2rem]"
          style={{ paddingTop: 'max(0.2rem, env(safe-area-inset-top))' }}
        >
          {/* md+ 컴팩트: 상세 본문과 동일 — 뷰포트 가운데 max-w-3xl 열 안에 가격(중앙) + В корзину(열 오른쪽) */}
          {productDesktopNav?.compact && (
            <div className="pointer-events-none absolute inset-0 z-[15] hidden justify-center px-4 sm:px-6 md:flex">
              <div className="pointer-events-auto relative flex h-full w-full max-w-3xl items-center">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative inline-block max-w-[min(58vw,22rem)]">
                    {productDesktopNav.rrp != null &&
                      productDesktopNav.prp != null &&
                      productDesktopNav.rrp !== productDesktopNav.prp && (
                        <span className="absolute right-full top-1/2 mr-1.5 max-w-[28vw] -translate-y-1/2 truncate text-left text-xs tabular-nums text-slate-500 line-through sm:mr-2 sm:max-w-none sm:text-sm sm:whitespace-nowrap">
                          {formatPrice(productDesktopNav.rrp)}
                        </span>
                      )}
                    <span className="block min-w-0 max-w-[42vw] truncate text-center text-sm font-semibold tabular-nums text-slate-900 sm:max-w-[min(50vw,16rem)] sm:text-base">
                      {formatPrice(productDesktopNav.prp ?? productDesktopNav.rrp ?? 0)}
                    </span>
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

          {/* 모바일: 로고만 가운데 */}
          <div className="flex w-full flex-1 items-center justify-center md:hidden">
            <Link to="/" className="flex shrink-0 items-center" aria-label="SEMO box">
              <span className="font-semibold tracking-[0.2em] text-brand">SEMO </span>
              <span className="font-semibold tracking-[0.2em] text-slate-700">box</span>
            </Link>
          </div>

          {/* md+: 로고 | 가운데(텍스트 메뉴 또는 상품 가격+В корзину) | 아이콘 */}
          <div className="hidden min-w-0 flex-1 items-center gap-3 md:flex">
            <Link to="/" className="relative z-20 flex shrink-0 items-center" aria-label="SEMO box">
              <span className="font-semibold tracking-[0.2em] text-brand">SEMO </span>
              <span className="font-semibold tracking-[0.2em] text-slate-700">box</span>
            </Link>
            <div className="flex min-w-0 flex-1 items-center justify-center px-1">
              {!productDesktopNav?.compact ? (
                <nav
                  className="flex min-w-0 max-w-[min(100%,52rem)] flex-wrap items-center justify-center gap-x-[calc(1.5rem*1.1)] text-sm lg:gap-x-[calc(2.5rem*1.1)]"
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
                  {/* SEMO Box — 호버 시 하단 서브바 표시 */}
                  <div
                    ref={semoBoxDesktopRef}
                    className="relative flex items-center"
                    onMouseEnter={semoBoxEnter}
                    onMouseLeave={semoBoxLeave}
                  >
                    <NavLink
                      to="/shop"
                      className={({ isActive }) =>
                        `${navLinkBase} whitespace-nowrap ${isActive || isSemoBoxActive ? activeClass : inactiveClass}`
                      }
                    >
                      SEMO Box
                    </NavLink>
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
            {/* 데스크톱: 유틸 아이콘 (컴팩트 시 В корзину는 오버레이 안) */}
            <div className="relative z-20 flex min-w-0 shrink-0 items-center gap-0.5">
            <div ref={cartDesktopRef} className="relative">
              <button
                type="button"
                aria-label="Корзина"
                onClick={() => {
                  setNotificationOpen(false);
                  setMobileShopMenuOpen(false);
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
                <div className="fixed left-1/2 top-[var(--semo-mobile-header-h)] z-50 flex min-h-[13rem] max-h-[min(72vh,calc(100vh-5rem))] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:left-auto md:right-4 md:top-[var(--semo-desktop-header-h)] md:translate-x-0">
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
                  setMobileShopMenuOpen(false);
                  setNotificationOpen((v) => !v);
                }}
                aria-label={
                  isLoggedIn && unreadCount > 0
                    ? `Уведомления, непрочитано: ${unreadCount}`
                    : 'Уведомления'
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
                <div className="fixed left-1/2 top-[var(--semo-mobile-header-h)] z-50 flex max-h-[min(72vh,calc(100vh-5rem))] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:left-auto md:right-4 md:top-[var(--semo-desktop-header-h)] md:translate-x-0">
                  <div className="relative shrink-0 border-b border-slate-100 px-4 py-3 pr-12">
                    <p className="text-sm font-semibold text-slate-800">Уведомления</p>
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
                      aria-label="Закрыть"
                      className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
                    {!isLoggedIn && (
                      <p className="py-8 text-center text-sm text-slate-500">Войдите, чтобы видеть уведомления.</p>
                    )}
                    {isLoggedIn && notificationRows.length === 0 && (
                      <p className="py-8 text-center text-sm text-slate-500">Пока нет уведомлений.</p>
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
                                  aria-label="Удалить"
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
              aria-label={isLoggedIn ? 'Profile' : 'Личный кабинет'}
              className={`flex h-10 w-10 items-center justify-center rounded-full border bg-white transition hover:border-brand/40 hover:bg-brand-soft/15 ${
                isProfileActive
                  ? isLoggedIn
                    ? 'border-[#0088cc] bg-[#0088cc]/10 text-[#0088cc]'
                    : 'border-brand/50 bg-brand-soft/25 text-brand'
                  : isLoggedIn
                    ? 'border-[#0088cc]/60 text-[#0088cc]'
                    : 'border-slate-200/90 text-slate-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="9" r="3.5" />
                <path d="M6 19.5c1.4-2.3 3.3-3.5 6-3.5s4.6 1.2 6 3.5" />
              </svg>
            </Link>
          </div>
        </div>
        </div>
      </header>

      {/* SEMO Box 서브 네비게이션 바 — 데스크톱: 호버 시 표시, 상단바 바로 아래 횡 메뉴 (틈 없이 경계선만) */}
      {semoBoxOpen && !productDesktopNav?.compact && (
        <div
          className="fixed left-0 right-0 z-[39] hidden border-b border-slate-200/60 bg-white/95 backdrop-blur-md md:block"
          style={{ top: 'var(--semo-desktop-header-h, 3.2rem)' }}
          onMouseEnter={semoBoxEnter}
          onMouseLeave={semoBoxLeave}
        >
          <nav className="mx-auto flex max-w-7xl items-center justify-center gap-x-8 px-4 py-2 lg:gap-x-12">
            {SEMO_BOX_SUBMENU.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                onClick={() => setSemoBoxOpen(false)}
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
              setMobileShopMenuOpen(false);
              setCartPopoverOpen(false);
            }}
          />
          <div
            ref={cartMobileRef}
            className="fixed left-2 right-2 z-50 flex min-h-[13rem] max-h-[min(75vh,32rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:hidden"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
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
              setMobileShopMenuOpen(false);
              setNotificationOpen(false);
            }}
          />
          <div
            className="fixed left-2 right-2 z-50 flex max-h-[min(75vh,32rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl md:hidden"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="relative shrink-0 border-b border-slate-100 px-4 py-3 pr-12">
              <p className="text-sm font-semibold text-slate-800">Уведомления</p>
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
                aria-label="Закрыть"
                className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
              {!isLoggedIn && (
                <p className="py-8 text-center text-sm text-slate-500">Войдите, чтобы видеть уведомления.</p>
              )}
              {isLoggedIn && notificationRows.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">Пока нет уведомлений.</p>
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
                            aria-label="Удалить"
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

      {/* 모바일: 하단바 바로 위 풀폭 리스트(팝업 카드 대신 구분선 리스트) */}
      {mobileShopMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            aria-hidden
            onClick={() => setMobileShopMenuOpen(false)}
          />
          <div
            className="fixed left-0 right-0 z-50 flex max-h-[min(55vh,20rem)] flex-col overflow-hidden border-t border-slate-200 bg-white md:hidden"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
            role="menu"
            aria-label="SEMO Box"
          >
            <div className="shrink-0 border-b border-slate-200 bg-slate-50/90 px-4 py-2">
              <p className="text-[11px] font-medium text-slate-500">SEMO Box</p>
            </div>
            <nav className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto overscroll-contain" aria-label="SEMO Box">
              {SEMO_BOX_SUBMENU.map((sub) => (
                <NavLink
                  key={sub.to}
                  to={sub.to}
                  role="menuitem"
                  onClick={() => setMobileShopMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex w-full items-center px-4 py-3.5 text-left text-sm font-normal transition-colors ${
                      isActive ? 'bg-brand-soft/25 text-brand' : 'text-slate-800 active:bg-slate-50'
                    }`
                  }
                >
                  {sub.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      )}

      {/* 모바일 전용: 하단 고정 바 — 맨 앞: 햄버거, 둘째: 샵(리스트) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingTop: '0.25rem', paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => {
            setMobileShopMenuOpen(false);
            setMobileMenuOpen(true);
          }}
          aria-label="Open menu"
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            isMenuActive ? 'bg-brand-soft/50 text-brand' : 'text-slate-600'
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={isMenuActive ? 2.2 : 2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="SEMO Box"
          aria-expanded={mobileShopMenuOpen}
          aria-haspopup="menu"
          onClick={() => {
            setMobileMenuOpen(false);
            setNotificationOpen(false);
            setCartPopoverOpen(false);
            setMobileShopMenuOpen((v) => !v);
          }}
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            mobileShopMenuOpen || isShop ? 'bg-brand-soft/50 text-brand' : 'text-slate-600'
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={mobileShopMenuOpen || isShop ? 2.2 : 2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Корзина"
          onClick={() => {
            setMobileShopMenuOpen(false);
            setNotificationOpen(false);
            setCartPopoverOpen((v) => !v);
          }}
          className={`relative flex h-10 items-center justify-center rounded-full px-3 transition ${
            isCartActive ? 'bg-brand-soft/50 text-brand' : 'text-slate-600'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={isCartActive ? 2.2 : 1.8}>
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          {totalCount > 0 && (
            <span className="absolute right-0 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setMobileShopMenuOpen(false);
            setCartPopoverOpen(false);
            setMobileMenuOpen(false);
            setNotificationOpen((v) => !v);
          }}
          aria-label={
            isLoggedIn && unreadCount > 0
              ? `Уведомления, непрочитано: ${unreadCount}`
              : 'Уведомления'
          }
          className={`relative flex h-10 items-center justify-center rounded-full px-3 transition ${
            isNotificationActive ? 'bg-brand-soft/50 text-brand' : 'text-slate-600 hover:text-brand'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={isNotificationActive ? 2.2 : 1.8}>
            <path d="M12 3a4 4 0 0 0-4 4v2.09c0 .46-.16.91-.46 1.26L6.3 12.76A2 2 0 0 0 6 14v1h12v-1a2 2 0 0 0-.3-1.24l-1.24-1.41A2 2 0 0 1 16 9.09V7a4 4 0 0 0-4-4z" />
            <path d="M10 18a2 2 0 0 0 4 0" />
          </svg>
          {isLoggedIn && unreadCount > 0 && (
            <span
              className="absolute right-0 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[10px] font-semibold leading-none text-white"
              aria-hidden
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
        <a
          href={telegramLinkedNav === true ? TELEGRAM_BOT_URL : undefined}
          target={telegramLinkedNav === true ? '_blank' : undefined}
          rel={telegramLinkedNav === true ? 'noopener noreferrer' : undefined}
          aria-label="Telegram"
          aria-disabled={telegramLinkedNav !== true}
          onClick={(e) => {
            setMobileShopMenuOpen(false);
            if (telegramLinkedNav !== true) e.preventDefault();
          }}
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            telegramLinkedNav === true
              ? 'bg-[#26A5E4]/15 text-[#26A5E4]'
              : 'cursor-not-allowed text-slate-300'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </a>
        <Link
          to={isLoggedIn ? '/profile' : '/login'}
          aria-label={isLoggedIn ? 'Profile' : 'Личный кабинет'}
          onClick={() => setMobileShopMenuOpen(false)}
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            isProfileActive
              ? isLoggedIn
                ? 'border-2 border-[#0088cc] bg-[#0088cc]/10 text-[#0088cc]'
                : 'bg-brand-soft/50 text-brand'
              : isLoggedIn
                ? 'border-2 border-[#0088cc] text-[#0088cc]'
                : 'text-slate-600'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
            <circle cx="12" cy="9" r="3.5" />
            <path d="M6 19.5c1.4-2.3 3.3-3.5 6-3.5s4.6 1.2 6 3.5" />
          </svg>
        </Link>
      </nav>

      {/* 모바일: 왼쪽 전체 메뉴 드로어 (햄버거 클릭 시) */}
      {mobileMenuOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            aria-hidden
            onClick={() => {
              setMobileShopMenuOpen(false);
              setMobileMenuOpen(false);
            }}
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 flex w-[14.4rem] max-w-[68vw] flex-col bg-white shadow-xl md:hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              <span className="font-semibold tracking-wide text-slate-800">Menu</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-0.5 overflow-auto p-4">
              <NavLink
                to="/about"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3.5 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                }
              >
                About SEMO
              </NavLink>
              <NavLink
                to="/journey"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3.5 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                }
              >
                Journey to SEMO
              </NavLink>
              {/* SEMO Box — 접히는 서브메뉴 */}
              <div>
                <button
                  type="button"
                  onClick={() => setMobileSemoBoxOpen((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3.5 text-base ${
                    isSemoBoxActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'
                  }`}
                >
                  SEMO Box
                  <svg
                    className={`h-4 w-4 transition-transform ${mobileSemoBoxOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {mobileSemoBoxOpen && (
                  <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l-2 border-brand/20 pl-2">
                    {SEMO_BOX_SUBMENU.map((sub) => (
                      <NavLink
                        key={sub.to}
                        to={sub.to}
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
                )}
              </div>
              <NavLink
                to="/support"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `rounded-xl px-4 py-3.5 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                }
              >
                FAQ
              </NavLink>
            </nav>
          </aside>
        </>
      )}
    </>
  );
};
