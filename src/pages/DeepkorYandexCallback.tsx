import React, { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * Yandex 로그인 콜백 relay — Deepkor 전용 도메인이 없어서 semo-box.com이
 * 대신 이 역할을 한다(같은 사업자·세모박스 소유). 얀덱스 콘솔의
 * "Redirect URI for web services"에 이 페이지의 정확한 URL이 등록돼
 * 있어야 한다: https://semo-box.com/deepkor/auth/yandex/callback
 *
 * 흐름: 얀덱스 → 이 페이지(?code=...&state=...) → yandex-auth Edge
 * Function 호출 → token_hash 받음 → 앱 딥링크(com.deepkor.deepkor://
 * yandex-callback?token_hash=...)로 리다이렉트 → 앱의 YandexCallbackListener가
 * 받아서 세션 완성.
 *
 * state에는 앱이 로그인 시작 시점의 익명 사용자 id를 실어보낸다 — 여기서는
 * 그대로 통과시켜 link_user_id로만 넘기고 내용은 검증하지 않는다(edge
 * function이 실제 익명 계정인지 재검증하므로 여기서 위조돼도 무해).
 *
 * 2026-08-27 도입.
 */
const YANDEX_AUTH_FUNCTION_URL = 'https://app-api.semo-box.com/functions/v1/yandex-auth';
const RELAY_REDIRECT_URI = 'https://semo-box.com/deepkor/auth/yandex/callback';
const DEEPKOR_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3MDQ2OTkyLCJleHAiOjE5NDQ3MjY5OTJ9.oVl5eBPmvNZSNEIism5LtgNAu2obtSZb74dISPBtCgc';
const APP_CALLBACK_SCHEME = 'com.deepkor.deepkor://yandex-callback';

type Status = 'processing' | 'redirecting' | 'error';

export const DeepkorYandexCallback: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const [status, setStatus] = useState<Status>('processing');
  const [errorDetail, setErrorDetail] = useState<string>('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    const code = params.get('code');
    const state = params.get('state');

    if (oauthError) {
      setErrorDetail(oauthError);
      setStatus('error');
      return;
    }
    if (!code) {
      setErrorDetail('missing_code');
      setStatus('error');
      return;
    }

    (async () => {
      try {
        const resp = await fetch(YANDEX_AUTH_FUNCTION_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: DEEPKOR_ANON_KEY },
          body: JSON.stringify({
            code,
            redirect_uri: RELAY_REDIRECT_URI,
            ...(state ? { link_user_id: state } : {}),
          }),
        });
        const data = await resp.json();
        if (!data.ok || !data.token_hash) {
          setErrorDetail(data.error || 'unknown_error');
          setStatus('error');
          return;
        }
        setStatus('redirecting');
        window.location.href = `${APP_CALLBACK_SCHEME}?token_hash=${encodeURIComponent(data.token_hash)}`;
      } catch {
        setErrorDetail('network_error');
        setStatus('error');
      }
    })();
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
      {status !== 'error' ? (
        <>
          <div className="mb-6 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          <p className="text-sm text-white/70">
            {status === 'redirecting'
              ? (isEn ? 'Signed in — returning to Deepkor…' : 'Вход выполнен — возвращаемся в Deepkor…')
              : (isEn ? 'Signing in…' : 'Выполняется вход…')}
          </p>
        </>
      ) : (
        <>
          <p className="text-base font-medium text-white">
            {isEn ? 'Sign-in failed' : 'Не удалось войти'}
          </p>
          <p className="mt-2 max-w-xs text-xs text-white/50">
            {isEn
              ? 'Please close this page and try again in the app.'
              : 'Закройте эту страницу и попробуйте снова в приложении.'}
          </p>
          <p className="mt-4 text-[11px] text-white/30">{errorDetail}</p>
        </>
      )}
    </main>
  );
};
