import { Link, NavLink } from 'react-router-dom';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';

const navLinkBase =
  'text-sm tracking-wide transition-colors border-b-2 border-transparent pb-1';

const activeClass = 'text-brand border-brand font-semibold';
const inactiveClass = 'text-slate-900 hover:text-brand';

/** 텔레그램 봇 — 지원/поддержка 링크 */
const TELEGRAM_BOT_URL = 'https://t.me/My_SEMO_Beautybot';

const NAV_LINKS = [
  { to: '/about', label: 'About SEMO' },
  { to: '/skin-test', label: 'Skin Type Test' },
  { to: '/shop', label: 'Beauty Box' },
  { to: '/support', label: 'Support' },
] as const;

export const Navbar: React.FC = () => {
  const { totalCount } = useCart();
  const { isLoggedIn, userId } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);
  const prevTelegramLinkedRef = useRef<boolean | null>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  const notifications: { id: string; type: 'info' | 'order'; title: string; body: string; date: string }[] = [
    {
      id: 'n1',
      type: 'info',
      title: 'Новая коллекция Beauty Box',
      body: 'Открыта предзаказ весна/лето 2026. Количество ограничено.',
      date: '04.03.2026',
    },
    {
      id: 'n2',
      type: 'order',
      title: 'Статус заказа',
      body: 'Ваш последний заказ обрабатывается. Уведомим, когда передадим в доставку.',
      date: '03.03.2026',
    },
  ];

  const fetchTelegramLinked = useCallback(() => {
    if (!isLoggedIn || !userId || !supabase) {
      setTelegramLinked(false);
      return;
    }
    supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        const linked = !!data?.telegram_id;
        const prev = prevTelegramLinkedRef.current;
        if (prev === true && !linked) {
          console.warn('Telegram state changed! (Navbar) — was linked, now unlinked. Check DB or network.');
        }
        prevTelegramLinkedRef.current = linked;
        setTelegramLinked(linked);
        try {
          localStorage.setItem('telegram_linked', linked ? '1' : '0');
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // fetch 실패 시 기존 상태 유지 — 네트워크 오류로 풀린 것처럼 보이지 않도록
        // setTelegramLinked(false) 제거
      });
  }, [isLoggedIn, userId]);

  useEffect(() => {
    fetchTelegramLinked();
  }, [fetchTelegramLinked]);

  // 탭 복귀 시(예: Telegram 연동 후) 연동 여부 다시 조회 → 아이콘 연하늘색 반영
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchTelegramLinked();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchTelegramLinked]);

  // 알림 열려 있을 때 바깥 영역 클릭하면 닫기 (동일 클릭으로 열린 직후에는 닫히지 않도록 다음 틱에 리스너 등록)
  useEffect(() => {
    if (!notificationOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setNotificationOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener('click', onDocClick), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', onDocClick);
    };
  }, [notificationOpen]);

  return (
    <>
      {/* 상단: 데스크톱은 풀 메뉴, 모바일은 로고만 */}
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="font-semibold tracking-[0.2em] text-brand">SEMO</span>
            <span className="font-light tracking-[0.2em] text-slate-800">beauty-box</span>
          </Link>

          {/* 데스크톱 메뉴 — md 이상에서만 */}
          <nav className="hidden flex-1 justify-center gap-6 self-end pb-1 md:flex lg:gap-8">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `${navLinkBase} ${isActive ? activeClass : inactiveClass}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div ref={notificationRef} className="relative flex items-center gap-2">
            <Link
              to="/cart"
              aria-label="Корзина"
              className="relative flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-brand hover:text-brand"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              {totalCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-white">
                  {totalCount > 99 ? '99+' : totalCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              aria-label="Уведомления"
              onClick={() => setNotificationOpen((v) => !v)}
              className={`relative flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-600 transition ${
                notificationOpen ? 'border-brand text-brand' : 'border-slate-200 hover:border-brand hover:text-brand'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M12 3a4 4 0 0 0-4 4v2.09c0 .46-.16.91-.46 1.26L6.3 12.76A2 2 0 0 0 6 14v1h12v-1a2 2 0 0 0-.3-1.24l-1.24-1.41A2 2 0 0 1 16 9.09V7a4 4 0 0 0-4-4z" />
                <path d="M10 18a2 2 0 0 0 4 0" />
              </svg>
            </button>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Telegram: поддержка"
              className={`flex h-9 w-9 items-center justify-center rounded-full border bg-white transition ${
                telegramLinked ? 'border-[#0088cc] text-[#0088cc]' : 'border-slate-200 text-slate-600 hover:border-[#0088cc] hover:text-[#0088cc]'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
            </a>
            <Link
              to={isLoggedIn ? '/profile' : '/login'}
              aria-label={isLoggedIn ? 'Profile' : 'Личный кабинет'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-brand hover:text-brand"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="9" r="3.5" />
                <path d="M6 19.5c1.4-2.3 3.3-3.5 6-3.5s4.6 1.2 6 3.5" />
              </svg>
            </Link>

            {notificationOpen && (
              <div className="group absolute right-0 top-11 z-30 w-80 max-w-[80vw] rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="relative flex items-center justify-between border-b border-slate-100 px-4 py-2">
                  <p className="text-xs font-semibold text-slate-800">Уведомления</p>
                  <button
                    type="button"
                    onClick={() => setNotificationOpen(false)}
                    aria-label="Закрыть"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-opacity hover:bg-slate-100 hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="max-h-80 overflow-auto px-3 py-2">
                  {notifications.length === 0 && (
                    <p className="px-1 py-2 text-xs text-slate-400">Пока нет уведомлений.</p>
                  )}
                  {notifications.length > 0 && (
                    <ul className="space-y-2">
                      {notifications.map((n) => (
                        <li
                          key={n.id}
                          className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700"
                        >
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            <span className="font-semibold">
                              {n.type === 'info' && 'Объявление'}
                              {n.type === 'order' && 'Заказ'}
                            </span>
                            <span className="text-[10px] text-slate-400">{n.date}</span>
                          </div>
                          <p className="text-[11px] font-semibold text-slate-900">{n.title}</p>
                          <p className="mt-0.5 text-[11px] text-slate-700">{n.body}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 모바일 전용: 하단 고정 바 — 높이만 낮춤, 아이콘 크기 유지 */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
        style={{ paddingTop: '0.25rem', paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open menu"
          className="flex h-10 items-center justify-center px-3 text-slate-600"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link to="/" aria-label="Home" className="flex h-10 items-center justify-center px-3 text-slate-600">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        </Link>
        <Link to="/shop" aria-label="Beauty Box" className="flex h-10 items-center justify-center px-3 text-slate-600">
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </Link>
        <Link to="/cart" aria-label="Cart" className="relative flex h-10 items-center justify-center px-3 text-slate-600">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
          </svg>
          {totalCount > 0 && (
            <span className="absolute right-0 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-white">
              {totalCount > 99 ? '99+' : totalCount}
            </span>
          )}
        </Link>
        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support via Telegram"
          className={`flex h-10 items-center justify-center px-3 transition ${
            telegramLinked ? 'text-[#0088cc]' : 'text-slate-600 hover:text-[#0088cc]'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="currentColor">
            <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
          </svg>
        </a>
        <Link to={isLoggedIn ? '/profile' : '/login'} aria-label={isLoggedIn ? 'Profile' : 'Личный кабинет'} className="flex h-10 items-center justify-center px-3 text-slate-600">
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
              {NAV_LINKS.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `rounded-xl px-4 py-3.5 text-base ${isActive ? 'bg-brand-soft/30 text-brand font-semibold' : 'text-slate-700 font-medium'}`
                  }
                >
                  {label}
                </NavLink>
              ))}
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-xl px-4 py-3.5 text-base font-medium text-[#0088cc]"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="currentColor">
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
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50">
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
