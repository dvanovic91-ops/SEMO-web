import { Link, NavLink } from 'react-router-dom';
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

const navLinkBase =
  'text-sm tracking-wide transition-colors border-b-2 border-transparent pb-1';

const activeClass = 'text-brand border-brand';
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
  const { isLoggedIn } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [telegramLinked, setTelegramLinked] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setTelegramLinked(false);
      return;
    }
    try {
      setTelegramLinked(localStorage.getItem('telegram_linked') === '1');
    } catch {
      setTelegramLinked(false);
    }
  }, [isLoggedIn]);

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
                    `rounded-xl px-4 py-3.5 text-base font-medium ${isActive ? 'bg-brand-soft/30 text-brand' : 'text-slate-700'}`
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
