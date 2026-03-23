import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, setRememberMe } from '../lib/supabase';
import { isValidEmailFormat } from '../lib/emailValidation';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';
import { triggerTelegramLogin } from '../lib/telegramAuth';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';

/**
 * 로그인 — 이메일/비밀번호 + 구글/얀덱스 OAuth 연동.
 * OAuth: 팝업 없이 현재 탭 전체를 리다이렉트.
 */

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn, initialized, applySession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMeChecked] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'yandex' | 'telegram' | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  if (!initialized) {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }
  if (isLoggedIn) return <Navigate to="/" replace />;

  const openOAuthRedirect = async (provider: 'google' | 'yandex') => {
    if (!supabase) return;
    setRememberMe(rememberMe);
    setOauthLoading(provider);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // 로그인 후 항상 홈으로 돌아오도록 설정
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) console.error(error);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleGoogleLogin = () => openOAuthRedirect('google');
  const handleYandexLogin = () => openOAuthRedirect('yandex');

  const handleTelegramLogin = async () => {
    if (!supabase) return;
    const botUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!botUsername || !supabaseUrl) {
      setLoginError('Telegram login не настроен.');
      return;
    }
    setOauthLoading('telegram');
    setLoginError(null);
    try {
      const result = await triggerTelegramLogin(supabase, supabaseUrl, botUsername);
      if (!result.ok) {
        if (result.error !== 'popup_closed' && result.error !== 'timeout') {
          setLoginError('Не удалось войти через Telegram. Попробуйте снова.');
        }
      }
      // 성공 시 onAuthStateChange가 세션 감지 → 자동 리디렉트
    } catch {
      setLoginError('Ошибка при входе через Telegram.');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleEmailLogin = async () => {
    setEmailError(null);
    setPasswordError(null);
    setLoginError(null);

    const trimmedEmail = email.trim();
    let hasError = false;
    if (!trimmedEmail) {
      setEmailError('Введите email.');
      hasError = true;
    } else if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError(
        'Только латиница, цифры и . _ % + - до @; домен как mail.ru или semo-box.ru.',
      );
      hasError = true;
    }
    if (!password) {
      setPasswordError('Введите пароль.');
      hasError = true;
    }
    if (hasError) return;
    if (!supabase) {
      setLoginError('Сервис входа временно недоступен.');
      return;
    }

    setRememberMe(rememberMe);
    setLoginLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('email not confirmed') || msg.includes('not confirmed')) {
          setLoginError('Email не подтверждён. Откройте письмо и подтвердите адрес, затем войдите снова.');
        } else if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials') || msg.includes('wrong') || msg.includes('password')) {
          setLoginError('Неверный email или пароль. Проверьте введённые данные.');
        } else {
          setLoginError(error.message || 'Не удалось войти. Попробуйте снова.');
        }
        return;
      }
      if (data?.session) {
        await applySession(data.session);
      }
      navigate('/', { replace: true });
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <main className="mx-auto min-w-0 max-w-md px-3 py-10 sm:px-6 sm:py-16">
      <header className="mb-8 text-center sm:mb-10">
        <h1 className="prose-ru text-xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Войти / зарегистрироваться
        </h1>
      </header>

      {/* 아이디/비밀번호 + Login 버튼 — 엔터 시 제출 */}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          handleEmailLogin();
        }}
      >
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="example@mail.ru"
            className={`${inputClass} ${emailError ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (emailError) setEmailError(null);
            }}
            onBlur={() => {
              const t = email.trim();
              if (!t) return;
              setEmailError(
                isValidEmailFormat(t)
                  ? null
                  : 'Только латиница, цифры и . _ % + - до @; домен как mail.ru или semo-box.ru.',
              );
            }}
          />
          {emailError && (
            <p className="mt-1 text-xs text-red-500">{emailError}</p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            placeholder="••••••••"
            className={`${inputClass} ${passwordError ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError(null);
            }}
          />
          {passwordError && (
            <p className="mt-1 text-xs text-red-500">{passwordError}</p>
          )}
          {loginError && (
            <p className="mt-1 text-sm text-red-600" role="alert">{loginError}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={loginLoading}
          className="min-h-11 w-full rounded-full bg-brand py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
        >
          {loginLoading ? 'Вход…' : 'Войти'}
        </button>
      </form>

      <label className="mt-6 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMeChecked(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
        />
        <span className="text-sm text-slate-700">Оставаться в системе</span>
      </label>

      <div className="mt-6 flex flex-col items-center gap-4">
        <p className="text-sm text-slate-500">или</p>
        <div className="flex items-center justify-center gap-8">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={oauthLoading !== null}
            aria-label="Войти через Google"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:border-slate-300 disabled:opacity-60 sm:h-14 sm:w-14"
          >
            {oauthLoading === 'google' ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleYandexLogin}
            disabled={oauthLoading !== null}
            aria-label="Войти через Yandex"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:border-slate-300 disabled:opacity-60 sm:h-14 sm:w-14"
          >
            {oauthLoading === 'yandex' ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            ) : (
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none">
              <text x="12" y="18" fontSize="20" fontWeight="700" fill="#FC3F1D" textAnchor="middle" fontFamily="Montserrat, Arial, sans-serif">Я</text>
            </svg>
            )}
          </button>
          <button
            type="button"
            onClick={handleTelegramLogin}
            disabled={oauthLoading !== null}
            aria-label="Войти через Telegram"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:border-slate-300 disabled:opacity-60 sm:h-14 sm:w-14"
          >
            {oauthLoading === 'telegram' ? (
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
            ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.63 3.72-.53.37-1.01.55-1.44.54-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.88 7.97-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .37z" fill="#26A5E4"/>
            </svg>
            )}
          </button>
        </div>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-5">
        <Link
          to="/register"
          className="block w-full rounded-full border border-slate-200 py-3.5 text-center text-base font-medium text-slate-700 transition hover:border-brand hover:text-brand"
        >
          Зарегистрироваться
        </Link>
      </div>
    </main>
  );
};
