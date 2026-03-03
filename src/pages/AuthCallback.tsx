/**
 * OAuth 콜백 전용 페이지.
 * - 팝업: 세션을 부모 창에 postMessage로 전달 후 닫음.
 * - 메인 창(리다이렉트 복귀): 세션 적용 후 / 로 이동.
 * - URL에 error(구글 등 OAuth 실패)가 있으면 즉시 에러 메시지 표시.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const AUTH_MESSAGE_TYPE = 'semo_supabase_auth';

/** URL hash/query에서 OAuth error 파라미터 추출 */
function getOAuthError(): string | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const hashParams = window.location.hash ? new URLSearchParams(window.location.hash.slice(1)) : null;
    const error = params.get('error') ?? hashParams?.get('error') ?? null;
    return error;
  } catch {
    return null;
  }
}

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
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

    const applySession = (session: { access_token: string; refresh_token: string }) => {
      if (window.opener) {
        try {
          window.opener.postMessage(
            { type: AUTH_MESSAGE_TYPE, access_token: session.access_token, refresh_token: session.refresh_token },
            window.location.origin
          );
        } catch {
          // ignore
        }
        setStatus('done');
        window.close();
      } else {
        setStatus('done');
        navigate('/', { replace: true });
      }
    };

    const tryGetSession = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token && session?.refresh_token) {
          applySession(session);
          return;
        }
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
          if (s?.access_token && s?.refresh_token) {
            applySession(s);
            subscription.unsubscribe();
          }
        });
        setTimeout(() => {
          subscription.unsubscribe();
          supabase.auth.getSession().then(({ data: { session: s2 } }) => {
            if (s2?.access_token && s2?.refresh_token) applySession(s2);
            else setStatus('error');
          });
        }, 3000);
      });
    };

    tryGetSession();
  }, [navigate]);

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
