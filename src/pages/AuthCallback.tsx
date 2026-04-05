/**
 * OAuth·가입 이메일 확인·매직링크(로그인) 공통 콜백 — 세션 확립 후 적절한 경로로 이동.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const AUTH_MESSAGE_TYPE = 'semo_supabase_auth';

function isRecoveryFromHash(): boolean {
  try {
    const h = window.location.hash;
    if (!h || h.length < 3) return false;
    const q = new URLSearchParams(h.startsWith('#') ? h.slice(1) : h);
    return q.get('type') === 'recovery';
  } catch {
    return false;
  }
}

function getOAuthError(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const hashParams = window.location.hash ? new URLSearchParams(window.location.hash.slice(1)) : null;
    return params.get('error') ?? hashParams?.get('error') ?? null;
  } catch {
    return null;
  }
}

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { refreshEmailConfirmationFromServer } = useAuth();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');
  const [errorReason, setErrorReason] = useState<string | null>(null);

  useEffect(() => {
    const urlError = getOAuthError();
    if (urlError) {
      setStatus('error');
      setErrorReason(urlError === 'login_required' ? 'login_required' : urlError);
      return;
    }

    if (!supabase) {
      setStatus('error');
      return;
    }

    if (isRecoveryFromHash()) {
      navigate(
        {
          pathname: '/auth/reset-password',
          search: window.location.search,
          hash: window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash,
        },
        { replace: true },
      );
      return;
    }

    const postAuthPath = (): string => {
      try {
        const h = window.location.hash;
        if (!h || h.length < 3) return '/profile';
        const q = new URLSearchParams(h.startsWith('#') ? h.slice(1) : h);
        const t = q.get('type');
        if (t === 'signup' || t === 'email' || t === 'magiclink') return '/profile';
      } catch {
        /* ignore */
      }
      return '/profile';
    };

    const finishSession = async (session: Session) => {
      if (window.opener) {
        try {
          window.opener.postMessage(
            { type: AUTH_MESSAGE_TYPE, access_token: session.access_token, refresh_token: session.refresh_token },
            window.location.origin,
          );
        } catch {
          // ignore
        }
        setStatus('done');
        window.close();
        return;
      }

      await supabase.auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
      try {
        await refreshEmailConfirmationFromServer();
      } catch {
        /* ignore */
      }
      setStatus('done');
      navigate(postAuthPath(), { replace: true });
    };

    const tryGetSession = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token && session?.refresh_token) {
          void finishSession(session);
          return;
        }
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, s) => {
          if (s?.access_token && s?.refresh_token) {
            void finishSession(s);
            subscription.unsubscribe();
          }
        });
        setTimeout(() => {
          subscription.unsubscribe();
          supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (s2?.access_token && s2?.refresh_token) void finishSession(s2);
            else setStatus('error');
          });
        }, 8000);
      });
    };

    tryGetSession();
  }, [navigate, refreshEmailConfirmationFromServer]);

  return (
    <div className="flex min-h-screen min-w-[280px] items-center justify-center bg-slate-50 px-4 py-8">
      <div className="text-center">
        {status === 'loading' && <p className="text-sm text-slate-600">Вход…</p>}
        {status === 'done' && (
          <p className="text-sm text-slate-600">Готово. Закройте окно, если оно не закрылось.</p>
        )}
        {status === 'error' && (
          <>
            <p className="text-sm font-medium text-slate-800">
              {errorReason === 'login_required'
                ? 'Выберите аккаунт Google или войдите заново.'
                : 'Ошибка входа.'}
            </p>
            <p className="mt-2 text-xs text-slate-500">Закройте окно и попробуйте снова.</p>
          </>
        )}
      </div>
    </div>
  );
};

export { AUTH_MESSAGE_TYPE };
