import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, setRememberMe } from '../lib/supabase';
import { isValidEmailFormat } from '../lib/emailValidation';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';
import { LegalDocLinksEn, LegalDocLinksRu } from '../components/LegalDocLinksRu';
import { useI18n } from '../context/I18nContext';
import { LOGIN_LEGAL_INTRO } from '../lib/registerFormCopy';
import { isTelegramMiniApp } from '../lib/telegramAuth';
import { getPasswordResetRedirectTo, getYandexOAuthRedirectUri } from '../lib/auth';
import { isRecoveryAccessToken } from '../lib/authRecovery';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';

const FORGOT_COOLDOWN_SEC = 60;

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.min(totalSec, 99 * 60 + 59));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

/**
 * 로그인 — 이메일/비밀번호 + 구글/얀덱스 OAuth 연동.
 * OAuth: 팝업 없이 현재 탭 전체를 리다이렉트.
 */

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { isLoggedIn, initialized, applySession } = useAuth();
  const tt = {
    title: language === 'en' ? 'Sign in / Register' : 'Войти / зарегистрироваться',
    password: language === 'en' ? 'Password' : 'Пароль',
    login: language === 'en' ? 'Sign in' : 'Войти',
    loginLoading: language === 'en' ? 'Signing in…' : 'Вход…',
    or: language === 'en' ? 'or' : 'или',
    stay: language === 'en' ? 'Stay signed in' : 'Оставаться в системе',
    register: language === 'en' ? 'Register' : 'Зарегистрироваться',
    forgot: language === 'en' ? 'Forgot password?' : 'Забыли пароль?',
    forgotSend: language === 'en' ? 'Send reset link' : 'Отправить ссылку',
    forgotSending: language === 'en' ? 'Sending…' : 'Отправка…',
    forgotSent:
      language === 'en'
        ? 'Reset link sent — check your inbox.'
        : 'Ссылка отправлена — проверьте почту.',
    forgotFail: language === 'en' ? 'Could not send. Try again later.' : 'Не удалось отправить. Попробуйте позже.',
    forgotResend: language === 'en' ? 'Resend email' : 'Отправить снова',
    emailNotRegistered:
      language === 'en'
        ? 'No account uses this email. Register or check the spelling.'
        : 'Аккаунт с таким email не найден. Зарегистрируйтесь или проверьте адрес.',
    showPassword: language === 'en' ? 'Show password' : 'Показать пароль',
    hidePassword: language === 'en' ? 'Hide password' : 'Скрыть пароль',
    emailRequired: language === 'en' ? 'Enter your email.' : 'Введите email.',
    emailInvalidFormat:
      language === 'en'
        ? 'Use Latin letters, numbers and . _ % + - before @; domain like mail.ru or semo-box.ru.'
        : 'Только латиница, цифры и . _ % + - до @; домен как mail.ru или semo-box.ru.',
    passwordRequired: language === 'en' ? 'Enter your password.' : 'Введите пароль.',
    serviceUnavailable:
      language === 'en' ? 'Sign-in is temporarily unavailable.' : 'Сервис входа временно недоступен.',
    loginEmailNotConfirmed:
      language === 'en'
        ? 'Email not confirmed. Open the message, confirm your address, then sign in again.'
        : 'Email не подтверждён. Откройте письмо и подтвердите адрес, затем войдите снова.',
    loginInvalidCredentials:
      language === 'en'
        ? 'Wrong email or password. Check what you entered.'
        : 'Неверный email или пароль. Проверьте введённые данные.',
    loginGenericFail:
      language === 'en' ? 'Could not sign in. Please try again.' : 'Не удалось войти. Попробуйте снова.',
  };
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMeChecked] = useState(true);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'yandex' | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotCooldownSeconds, setForgotCooldownSeconds] = useState(0);
  const [forgotEverSent, setForgotEverSent] = useState(false);
  /** null = 아직 세션 확인 전 — 복구(recovery) JWT면 비밀번호 변경으로 보냄 */
  const [recoveryRedirect, setRecoveryRedirect] = useState<boolean | null>(null);

  const isMiniApp = useMemo(() => (typeof window !== 'undefined' ? isTelegramMiniApp() : false), []);

  useEffect(() => {
    if (!isLoggedIn || !supabase) {
      setRecoveryRedirect(null);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      const t = session?.access_token;
      setRecoveryRedirect(t ? isRecoveryAccessToken(t) : false);
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  useEffect(() => {
    if (forgotCooldownSeconds <= 0) return undefined;
    const id = window.setTimeout(() => {
      setForgotCooldownSeconds((sec) => Math.max(0, sec - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [forgotCooldownSeconds]);

  if (!initialized) {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }
  if (isLoggedIn) {
    if (recoveryRedirect === null) {
      return (
        <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
          <SemoPageSpinner />
        </main>
      );
    }
    if (recoveryRedirect) {
      return <Navigate to="/auth/reset-password" replace />;
    }
    return <Navigate to="/" replace />;
  }

  const handleGoogleLogin = async () => {
    if (isMiniApp) return;
    if (!supabase) return;
    setRememberMe(rememberMe);
    setOauthLoading('google');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) console.error(error);
    } finally {
      setOauthLoading(null);
    }
  };

  const handleYandexLogin = () => {
    if (isMiniApp) return;
    const clientId = import.meta.env.VITE_YANDEX_CLIENT_ID || '488f7e3680314946b02f39be0c4368f8';
    const redirectUri = getYandexOAuthRedirectUri();
    if (!redirectUri) {
      console.error('[Yandex] redirect URI missing');
      return;
    }
    setRememberMe(rememberMe);
    setOauthLoading('yandex');
    window.location.href = `https://oauth.yandex.com/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  const handleEmailLogin = async () => {
    setEmailError(null);
    setPasswordError(null);
    setLoginError(null);

    const trimmedEmail = email.trim();
    let hasError = false;
    if (!trimmedEmail) {
      setEmailError(tt.emailRequired);
      hasError = true;
    } else if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError(tt.emailInvalidFormat);
      hasError = true;
    }
    if (!password) {
      setPasswordError(tt.passwordRequired);
      hasError = true;
    }
    if (hasError) return;
    if (!supabase) {
      setLoginError(tt.serviceUnavailable);
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
          setLoginError(tt.loginEmailNotConfirmed);
        } else if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials') || msg.includes('wrong') || msg.includes('password')) {
          setLoginError(tt.loginInvalidCredentials);
        } else {
          setLoginError(error.message || tt.loginGenericFail);
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

  const handleForgotReset = async () => {
    setForgotError(null);
    setForgotMessage(null);
    if (forgotCooldownSeconds > 0) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setForgotError(tt.emailRequired);
      return;
    }
    if (!isValidEmailFormat(trimmedEmail)) {
      setForgotError(tt.emailInvalidFormat);
      return;
    }
    if (!supabase) {
      setForgotError(tt.forgotFail);
      return;
    }
    setForgotLoading(true);
    try {
      const { data: registered, error: rpcError } = await supabase.rpc('check_email_registered_for_reset', {
        p_email: trimmedEmail,
      });
      if (!rpcError && registered === false) {
        setForgotError(tt.emailNotRegistered);
        return;
      }

      setRememberMe(rememberMe);
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: getPasswordResetRedirectTo(),
      });
      if (error) {
        setForgotError(tt.forgotFail);
        return;
      }
      setForgotEverSent(true);
      setForgotCooldownSeconds(FORGOT_COOLDOWN_SEC);
      setForgotMessage(tt.forgotSent);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <main className="mx-auto min-w-0 w-full max-w-md px-3 py-10 sm:max-w-3xl sm:px-6 sm:py-16 lg:max-w-4xl">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8 text-center sm:mb-10">
          <h1 className="prose-ru text-xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {tt.title}
          </h1>
        </header>

        {isMiniApp && (
          <div
            className="mb-6 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-left text-sm text-slate-800"
            role="status"
          >
            <p className="font-medium">
              {language === 'en'
                ? 'Opened inside Telegram'
                : 'Открыто внутри Telegram'}
            </p>
            <p className="mt-1 text-slate-600">
              {language === 'en'
                ? 'Google blocks sign-in from this embedded view. Use email and password, or open the site in Safari/Chrome for Google.'
                : 'Google и Яндекс не открывают вход из встроенного окна Telegram (политика безопасности). Войдите по email и паролю или откройте сайт в обычном браузере. Если аккаунт уже привязан к Telegram — вход выполняется автоматически при открытии мини-приложения.'}
            </p>
          </div>
        )}

        {/* 아이디/비밀번호 + Login 버튼 — 엔터 시 제출 */}
        <form
          className="space-y-5 overflow-x-visible"
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
                setEmailError(isValidEmailFormat(t) ? null : tt.emailInvalidFormat);
              }}
            />
            {emailError && (
              <p className="mt-1 text-xs text-red-500">{emailError}</p>
            )}
          </div>
          <div className="min-w-0 overflow-x-visible">
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              {tt.password}
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className={`${inputClass} pr-12 ${passwordError ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
              />
              <button
                type="button"
                aria-label={showPassword ? tt.hidePassword : tt.showPassword}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 flex h-9 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                    />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
            {passwordError && (
              <p className="mt-1 text-xs text-red-500">{passwordError}</p>
            )}
            {loginError && (
              <p className="mt-1 text-sm text-red-600" role="alert">{loginError}</p>
            )}
            <div className="mt-2">
              <button
                type="button"
                className="text-left text-sm font-medium text-brand hover:underline"
                onClick={() => {
                  setForgotOpen((v) => !v);
                  setForgotMessage(null);
                  setForgotError(null);
                }}
              >
                {tt.forgot}
              </button>
              {forgotOpen && (
                <div className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <p className="text-sm text-slate-500">
                    {language === 'en'
                      ? "We'll send a reset link to the email above."
                      : 'Отправим ссылку для сброса пароля на email выше.'}
                  </p>
                  {forgotError && (
                    <p className="text-xs text-red-500" role="alert">{forgotError}</p>
                  )}
                  {forgotMessage && (
                    <p className="text-xs font-medium text-brand" role="status">{forgotMessage}</p>
                  )}
                  <div className="flex justify-center">
                    <button
                      type="button"
                      disabled={forgotLoading || forgotCooldownSeconds > 0}
                      onClick={() => void handleForgotReset()}
                      className="min-h-11 w-1/2 rounded-full border border-brand bg-white py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft/30 disabled:pointer-events-none disabled:opacity-60"
                    >
                      {forgotLoading ? tt.forgotSending : tt.forgotSend}
                    </button>
                  </div>
                  {forgotEverSent && forgotCooldownSeconds > 0 && (
                    <p className="text-center text-xs text-slate-400" aria-live="polite">
                      {language === 'en' ? 'Resend available in' : 'Повторная отправка через'}{' '}
                      <span className="tabular-nums font-medium text-slate-600">{formatMmSs(forgotCooldownSeconds)}</span>
                    </p>
                  )}
                  {forgotEverSent && forgotCooldownSeconds === 0 && (
                    <button
                      type="button"
                      onClick={() => void handleForgotReset()}
                      className="w-full text-center text-sm text-slate-500 hover:text-brand transition"
                    >
                      {tt.forgotResend}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <button
            type="submit"
            disabled={loginLoading}
            className="min-h-11 w-full rounded-full bg-brand py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
          >
            {loginLoading ? tt.loginLoading : tt.login}
          </button>
        </form>
      </div>

      <p
        className="mx-auto mt-4 w-full text-center text-[12px] leading-snug text-slate-500 text-balance sm:mt-5 sm:text-[13px] sm:leading-normal"
        lang={language === 'en' ? 'en' : 'ru'}
      >
        {LOGIN_LEGAL_INTRO[language]}
        {language === 'en' ? <LegalDocLinksEn /> : <LegalDocLinksRu />}.
      </p>

      <div className="mx-auto mt-6 w-full max-w-md">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMeChecked(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span className="text-sm text-slate-700">{tt.stay}</span>
        </label>

        <div className="mt-6 flex flex-col items-center gap-4">
          <p className="text-sm text-slate-500">{tt.or}</p>
          <div className="flex items-center justify-center gap-8">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={oauthLoading !== null || isMiniApp}
              title={isMiniApp ? (language === 'en' ? 'Not available in Telegram Mini App' : 'Недоступно в мини-приложении Telegram') : undefined}
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
              disabled={oauthLoading !== null || isMiniApp}
              title={isMiniApp ? (language === 'en' ? 'Not available in Telegram Mini App' : 'Недоступно в мини-приложении Telegram') : undefined}
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
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5">
          <Link
            to="/register"
            className="block w-full rounded-full border border-slate-200 py-3.5 text-center text-base font-medium text-slate-700 transition hover:border-brand hover:text-brand"
          >
            {tt.register}
          </Link>
        </div>
      </div>
    </main>
  );
};
