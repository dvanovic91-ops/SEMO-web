import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

/** 테스트용 관리자 이메일 — 이 계정으로 로그인 시 개인정보 화면 확인 가능 */
const TEST_ADMIN_EMAIL = 'admin@semo-beautybox.com';

/**
 * 로그인 — 이메일/비밀번호 + 구글/얀덱스 OAuth 연동.
 * OAuth 가입 시 백엔드에서 신규 사용자를 /register/shipping으로 보내면 배송 정보만 입력.
 * "Войти как администратор" 클릭 시 테스트 계정으로 로그인되어 개인정보(Profile) 화면으로 이동.
 */
export const Login: React.FC = () => {
  const { setUserEmail } = useAuth();
  const navigate = useNavigate();

  /** Supabase Auth로 구글 로그인 (리다이렉트는 Supabase → 구글 → Supabase → 우리 사이트) */
  const handleGoogleLogin = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) console.error(error);
  };
  const handleYandexLogin = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'yandex',
      options: { redirectTo: `${window.location.origin}/` },
    });
    if (error) console.error(error);
  };

  /** 테스트용: 관리자 이메일로 로그인 처리 후 개인정보 페이지로 이동 */
  const handleTestAdminLogin = () => {
    setUserEmail(TEST_ADMIN_EMAIL);
    navigate('/profile', { replace: true });
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 text-center">
        <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Войти / зарегистрироваться
        </h1>
      </header>

      {/* 아이디/비밀번호 + Login 버튼 */}
      <section className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="example@mail.ru"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className={inputClass}
          />
        </div>
        <button
          type="button"
          className="w-full rounded-full bg-brand py-3.5 text-base font-semibold text-white transition hover:bg-brand/90"
        >
          Войти
        </button>
      </section>

      {/* 구글/얀덱스 연동 가입 */}
      {/* 테스트용: 관리자 계정으로 로그인 → 개인정보(Profile) 화면 확인 */}
      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <p className="mb-2 text-center text-xs font-medium text-amber-800">
          Для проверки личного кабинета (тест)
        </p>
        <button
          type="button"
          onClick={handleTestAdminLogin}
          className="w-full rounded-full border border-amber-300 bg-white py-2.5 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
        >
          Войти как администратор
        </button>
      </section>

      <div className="mt-10 flex flex-col items-center gap-4">
        <p className="text-sm text-slate-500">или</p>
        <div className="flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={handleGoogleLogin}
            aria-label="Войти через Google"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:border-slate-300 sm:h-14 sm:w-14"
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleYandexLogin}
            aria-label="Войти через Yandex"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:border-slate-300 sm:h-14 sm:w-14"
          >
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none">
              <text x="12" y="18" fontSize="20" fontWeight="700" fill="#FC3F1D" textAnchor="middle" fontFamily="Montserrat, Arial, sans-serif">Я</text>
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-10 border-t border-slate-100 pt-8">
        <Link
          to="/register"
          className="block w-full rounded-full border border-slate-200 py-3.5 text-center text-base font-medium text-slate-700 transition hover:border-brand hover:text-brand"
        >
          Зарегистрироваться
        </Link>
        <p className="mt-4 text-center text-xs text-slate-500">
          После регистрации привяжите Telegram в разделе «Профиль» — заказы и баллы будут доступны и в боте.
        </p>
      </div>

      <p className="mt-6 text-center">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
          ← На главную
        </Link>
      </p>
    </main>
  );
};
