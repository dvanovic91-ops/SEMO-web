/**
 * Yandex OAuth 콜백 페이지.
 * Yandex에서 ?code=... 로 리다이렉트 → Edge Function 호출 → 세션 생성 → 홈으로 이동
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getYandexOAuthRedirectUri } from '../lib/auth';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';

export const YandexCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const yandexError = params.get('error');

    if (yandexError) {
      setError(yandexError === 'access_denied' ? 'Вы отклонили авторизацию.' : yandexError);
      return;
    }

    if (!code) {
      setError('Код авторизации отсутствует.');
      return;
    }

    if (!supabase) {
      setError('Сервис временно недоступен.');
      return;
    }

    (async () => {
      const redirectUri = getYandexOAuthRedirectUri();
      if (!redirectUri) {
        setError('Не настроен redirect URI (VITE_YANDEX_REDIRECT_URI).');
        return;
      }
      try {
        // Edge Function 호출 — redirect_uri 는 authorize 요청과 동일해야 토큰 교환 성공
        const { data: result, error: invokeErr } = await supabase.functions.invoke('yandex-auth', {
          body: { code, redirect_uri: redirectUri },
        });

        if (invokeErr) {
          setError(`Ошибка сервера: ${invokeErr.message}`);
          return;
        }

        if (!result?.ok) {
          setError(result?.error || 'Не удалось войти через Яндекс.');
          return;
        }

        // verifyOtp로 세션 생성
        const { error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: result.token_hash,
          type: 'magiclink',
        });

        if (otpErr) {
          setError(`Ошибка сессии: ${otpErr.message}`);
          return;
        }

        // 성공 → 홈으로
        navigate('/', { replace: true });
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="text-center">
          <p className="text-sm font-medium text-slate-800">Ошибка входа через Яндекс</p>
          <p className="mt-2 text-xs text-slate-500">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm text-white"
          >
            Вернуться
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className={`${SEMO_FULL_PAGE_LOADING_MAIN_CLASS} bg-slate-50`}>
      <div className="flex flex-col items-center gap-3 text-center">
        <SemoPageSpinner showLabel={false} />
        <p className="text-sm text-slate-600">Вход через Яндекс…</p>
      </div>
    </main>
  );
};
