import React, { useEffect, useState } from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * Yandex 로그인 콜백 relay — 얀덱스 콘솔 Redirect URI:
 * https://semo-box.com/deepkor/auth/yandex/callback
 *
 * 토큰 교환을 여기서 기다리지 않는다. 페이지 로드 즉시 앱 딥링크로 튕기고
 * (`yandex_code`), 교환은 앱이 한다. 사파리가 비동기 fetch 뒤 커스텀 스킴을
 * 막아서 "Open Deepkor" 버튼을 강제하던 이전 UX를 없애기 위함.
 *
 * 프로덕션은 vercel rewrite로 정적 HTML이 이 라우트보다 먼저 나간다.
 * 이 React 페이지는 로컬 Vite / rewrite 누락 시의 동일 동작 폴백.
 */
const APP_CALLBACK_SCHEME = 'com.deepkor.deepkor://yandex-callback';

type Status = 'redirecting' | 'error';

export const DeepkorYandexCallback: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const [status, setStatus] = useState<Status>('redirecting');
  const [errorDetail, setErrorDetail] = useState<string>('');
  const [appLink, setAppLink] = useState<string>('');
  const [showFallback, setShowFallback] = useState(false);

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

    const qs = new URLSearchParams({ yandex_code: code });
    if (state) qs.set('state', state);
    const link = `${APP_CALLBACK_SCHEME}?${qs.toString()}`;
    setAppLink(link);
    window.location.replace(link);

    const timer = window.setTimeout(() => setShowFallback(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center">
      {status !== 'error' ? (
        showFallback && appLink ? (
          <a
            href={appLink}
            className="rounded-full bg-white px-6 py-3 text-sm font-medium text-slate-950"
          >
            {isEn ? 'Open KOSKOS' : 'Открыть KOSKOS'}
          </a>
        ) : null
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
