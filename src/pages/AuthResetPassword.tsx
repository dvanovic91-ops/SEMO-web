/**
 * 비밀번호 재설정 메일 링크 수신 후 이동하는 페이지.
 * Supabase 대시보드 Redirect URLs에 `${origin}/auth/reset-password` 등록 필요.
 * resetPasswordForEmail의 redirectTo도 동일 URL로 맞출 것.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';

type Phase = 'loading' | 'ready' | 'error';

const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';

export const AuthResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { applySession, initialized } = useAuth();
  const [phase, setPhase] = useState<Phase>('loading');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const tt = {
    title: language === 'en' ? 'Set a new password' : 'Новый пароль',
    subtitle:
      language === 'en'
        ? 'Enter a new password for your SEMO Box account.'
        : 'Введите новый пароль для аккаунта SEMO Box.',
    newPw: language === 'en' ? 'New password' : 'Новый пароль',
    repeat: language === 'en' ? 'Repeat password' : 'Повторите пароль',
    submit: language === 'en' ? 'Update password' : 'Сохранить пароль',
    submitting: language === 'en' ? 'Saving…' : 'Сохранение…',
    backLogin: language === 'en' ? 'Back to sign in' : 'Ко входу',
    loadError:
      language === 'en'
        ? 'This link is invalid or has expired. Request a new reset email from the sign-in page.'
        : 'Ссылка недействительна или срок истёк. Запросите новое письмо на странице входа.',
    short: language === 'en' ? 'At least 6 characters.' : 'Не менее 6 символов.',
    mismatch: language === 'en' ? 'Passwords do not match.' : 'Пароли не совпадают.',
  };

  useEffect(() => {
    if (!supabase) {
      setPhase('error');
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let subscription: { unsubscribe: () => void } | null = null;

    const applyAndReady = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.access_token) return;
      try {
        await applySession(session);
      } catch {
        // ignore
      }
      if (!cancelled) setPhase('ready');
    };

    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token && session?.refresh_token) {
        await applyAndReady();
        return;
      }

      const { data: { subscription: sub } } = supabase.auth.onAuthStateChange((_event, s) => {
        if (cancelled || !s?.access_token || !s?.refresh_token) return;
        if (timeoutId != null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        sub.unsubscribe();
        void applyAndReady();
      });
      subscription = sub;

      timeoutId = setTimeout(() => {
        timeoutId = null;
        sub.unsubscribe();
        void supabase.auth.getSession().then(({ data: { session: s2 } }) => {
          if (cancelled) return;
          if (s2?.access_token && s2?.refresh_token) void applyAndReady();
          else setPhase('error');
        });
      }, 4000);
    })();

    return () => {
      cancelled = true;
      if (timeoutId != null) clearTimeout(timeoutId);
      subscription?.unsubscribe();
    };
  }, [applySession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!supabase) return;
    if (!pw || pw.length < 6) {
      setFormError(tt.short);
      return;
    }
    if (pw !== pw2) {
      setFormError(tt.mismatch);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setFormError(error.message);
        return;
      }
      navigate('/', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialized) {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }

  if (phase === 'loading') {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }

  if (phase === 'error') {
    return (
      <main className="mx-auto min-w-0 w-full max-w-md px-3 py-16 sm:px-6">
        <p className="text-center text-sm text-slate-700">{tt.loadError}</p>
        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm font-medium text-brand hover:underline">
            {tt.backLogin}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-w-0 w-full max-w-md px-3 py-10 sm:px-6 sm:py-16">
      <h1 className="prose-ru text-center text-xl font-semibold text-slate-900 sm:text-2xl">{tt.title}</h1>
      <p className="mt-2 text-center text-sm text-slate-600">{tt.subtitle}</p>
      <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="reset-pw" className="mb-1 block text-sm font-medium text-slate-700">
            {tt.newPw}
          </label>
          <input
            id="reset-pw"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={pw}
            onChange={(e) => {
              setPw(e.target.value);
              if (formError) setFormError(null);
            }}
          />
        </div>
        <div>
          <label htmlFor="reset-pw2" className="mb-1 block text-sm font-medium text-slate-700">
            {tt.repeat}
          </label>
          <input
            id="reset-pw2"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            value={pw2}
            onChange={(e) => {
              setPw2(e.target.value);
              if (formError) setFormError(null);
            }}
          />
        </div>
        {formError && (
          <p className="text-sm text-red-600" role="alert">
            {formError}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 w-full rounded-full bg-brand py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
        >
          {submitting ? tt.submitting : tt.submit}
        </button>
      </form>
      <p className="mt-6 text-center">
        <Link to="/login" className="text-sm text-slate-500 hover:text-slate-800">
          {tt.backLogin}
        </Link>
      </p>
    </main>
  );
};
