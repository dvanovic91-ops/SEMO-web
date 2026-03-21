import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
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
  { to: '/skin-test', label: 'Skin Type Test' },
  { to: '/journey', label: 'Journey to SEMO' },
  { to: '/shop', label: 'Beauty Box' },
  { to: '/promo', label: 'Promo' },
  { to: '/support', label: 'Support' },
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
  const location = useLocation();
  const navigate = useNavigate();
  const { items, total, totalCount, updateQuantity } = useCart();
  const { isLoggedIn, userId } = useAuth();
  /** true: аккаунт привязан к Telegram — иконка в шапке #26A5E4; иначе тёмная */
  const [telegramLinkedNav, setTelegramLinkedNav] = useState<boolean | null>(null);
  const { items: notificationItems, unreadCount, markAllRead, markNotificationRead, deleteNotification } =
    useNotifications(isLoggedIn ? userId : null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [cartPopoverOpen, setCartPopoverOpen] = useState(false);
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
  const isHome = path === '/';
  const isShop = path.startsWith('/shop');
  const isCartActive = path === '/cart' || cartPopoverOpen;
  const isNotificationActive = notificationOpen;
  const isProfileActive = path.startsWith('/profile') || path === '/login';
  const isMenuActive = NAV_LINKS.some((l) => l.to !== '/shop' && (path === l.to || path.startsWith(l.to + '/')));

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
                {/* Cart.tsx 모바일과 동일: 사진(좌) | 제목 → 수량(좌)+가격(우, clamp) */}
                <div className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-2">
                  <div className="row-span-2 flex h-14 w-14 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-white">
                    {it.imageUrl ? (
                      <img src={it.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">Слот</span>
                    )}
                  </div>
                  <p className="min-w-0 text-sm font-medium leading-snug text-slate-900 line-clamp-2">{it.name}</p>
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
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div
          className="relative mx-auto flex h-14 w-full min-w-0 max-w-7xl items-center px-4 sm:h-16"
          style={{ paddingTop: 'max(0.25rem, env(safe-area-inset-top))' }}
        >
          <div className="flex w-full flex-1 items-center justify-center md:w-auto md:justify-start">
            <Link to="/" className="flex shrink-0 items-center" aria-label="SEMO box">
              <span className="font-semibold tracking-[0.2em] text-brand">SEMO </span>
              <span className="font-semibold tracking-[0.2em] text-slate-700">box</span>
            </Link>
          </div>
          {/* 데스크톱: 화면 가운데 정렬된 텍스트 메뉴 (Telegram은 우측 아이콘으로만) */}
          <nav
            className="absolute left-1/2 top-1/2 hidden min-w-0 max-w-[min(100%,52rem)] -translate-x-1/2 -translate-y-1/2 flex-wrap items-center justify-center gap-x-[calc(0.75rem*1.1)] text-sm md:flex lg:gap-x-[calc(1.25rem*1.1)]"
            aria-label="Main"
          >
            {NAV_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${navLinkBase} whitespace-nowrap ${isActive ? activeClass : inactiveClass}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          {/* 데스크톱: 우측 유틸 아이콘 — 스크린샷과 동일 순서 */}
          <div className="hidden flex-1 items-center justify-end gap-0.5 md:flex">
            <div ref={cartDesktopRef} className="relative">
              <button
                type="button"
                aria-label="Корзина"
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
                <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] z-50 flex min-h-[13rem] max-h-[min(72vh,calc(100vh-5rem))] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:top-[calc(env(safe-area-inset-top,0px)+4.25rem)] md:left-auto md:right-4 md:translate-x-0">
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
                <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] z-50 flex max-h-[min(72vh,calc(100vh-5rem))] w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl sm:top-[calc(env(safe-area-inset-top,0px)+4.25rem)] md:left-auto md:right-4 md:translate-x-0">
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
      </header>

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
            onClick={() => setNotificationOpen(false)}
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

      {/* 모바일 전용: 하단 고정 바 — 높이만 낮춤, 아이콘 크기 유지 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingTop: '0.25rem', paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            isMenuActive ? 'bg-brand-soft/50 text-brand' : 'text-slate-600'
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={isMenuActive ? 2.2 : 2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link
          to="/"
          aria-label="Home"
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            isHome ? 'bg-brand-soft/50 text-brand' : 'text-slate-600'
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={isHome ? 2.2 : 1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
        <Link
          to="/shop"
          aria-label="Beauty Box"
          className={`flex h-10 items-center justify-center rounded-full px-3 transition ${
            isShop ? 'bg-brand-soft/50 text-brand' : 'text-slate-600'
          }`}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={isShop ? 2.2 : 2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </Link>
        <button
          type="button"
          aria-label="Корзина"
          onClick={() => {
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
        <Link
          to={isLoggedIn ? '/profile' : '/login'}
          aria-label={isLoggedIn ? 'Profile' : 'Личный кабинет'}
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
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 z-50 w-72 max-w-[85vw] flex flex-col bg-white shadow-xl md:hidden">
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
              {NAV_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3.5 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-xl px-4 py-3.5 text-base font-medium text-slate-800"
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 shrink-0 ${telegramLinkedNav === true ? 'text-[#26A5E4]' : 'text-slate-900'}`}
                  fill="currentColor"
                >
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
                Support via Telegram
              </a>
              {/* 하단 고정: 개인/로그인 아이콘 — 로그인 시 프로필, 미로그인 시 Login / Register */}
              <div className="mt-auto border-t border-slate-100 pt-4">
                <Link
                  to={isLoggedIn ? '/profile' : '/login'}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex flex-col items-center gap-2 rounded-xl px-4 py-3.5 text-slate-700"
                >
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${
                      isLoggedIn ? 'border-2 border-[#0088cc] text-[#0088cc]' : 'border border-slate-200 bg-slate-50'
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <circle cx="12" cy="9" r="3.5" />
                      <path d="M6 19.5c1.4-2.3 3.3-3.5 6-3.5s4.6 1.2 6 3.5" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium">{isLoggedIn ? 'Profile' : 'Login / Register'}</span>
                </Link>
              </div>
            </nav>
          </aside>
        </>
      )}
    </>
  );
};
