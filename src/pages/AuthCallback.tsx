/**
 * OAuth 콜백 전용 페이지.
 * - 팝업: 세션을 부모 창에 postMessage로 전달 후 닫음.
 * - 메인 창(리다이렉트 복귀): 세션 적용 후 / 로 이동.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const AUTH_MESSAGE_TYPE = 'semo_supabase_auth';

export const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
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
    <div className="flex min-h-screen items-center justify-center bg-white">
      <p className="text-sm text-slate-500">
        {status === 'loading' && 'Вход…'}
        {status === 'done' && 'Готово. Закройте окно, если оно не закрылось.'}
        {status === 'error' && 'Ошибка. Закройте окно и попробуйте снова.'}
      </p>
    </div>
  );
};

export { AUTH_MESSAGE_TYPE };
