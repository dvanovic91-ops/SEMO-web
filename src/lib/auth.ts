/**
 * OAuth 연동 — 구글/얀덱스 로그인·가입 리다이렉트 URL 생성.
 * 실제 가입·로그인은 백엔드 callback에서 처리 후, 신규 사용자는 /register/shipping으로 보냄.
 *
 * 필요 환경 변수 (.env):
 * - VITE_GOOGLE_CLIENT_ID   — Google Cloud Console OAuth 2.0 클라이언트 ID
 * - VITE_GOOGLE_REDIRECT_URI — 백엔드 callback URL (예: https://api.도메인/auth/google/callback)
 * - VITE_YANDEX_CLIENT_ID  — Yandex OAuth 앱 ID
 * - VITE_YANDEX_REDIRECT_URI — 백엔드 callback URL (예: https://api.도메인/auth/yandex/callback)
 */

const getEnv = (key: string): string => {
  const v = import.meta.env[key];
  return typeof v === 'string' ? v : '';
};

export function getGoogleAuthUrl(): string {
  const clientId = getEnv('VITE_GOOGLE_CLIENT_ID');
  const redirectUri = getEnv('VITE_GOOGLE_REDIRECT_URI');
  if (!clientId || !redirectUri) {
    console.warn('VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_REDIRECT_URI not set');
    return '';
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getYandexAuthUrl(): string {
  const clientId = getEnv('VITE_YANDEX_CLIENT_ID');
  const redirectUri = getEnv('VITE_YANDEX_REDIRECT_URI');
  if (!clientId || !redirectUri) {
    console.warn('VITE_YANDEX_CLIENT_ID or VITE_YANDEX_REDIRECT_URI not set');
    return '';
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    force_confirm: 'yes',
  });
  return `https://oauth.yandex.ru/authorize?${params.toString()}`;
}

export function redirectToGoogle(): void {
  const url = getGoogleAuthUrl();
  if (url) window.location.href = url;
}

export function redirectToYandex(): void {
  const url = getYandexAuthUrl();
  if (url) window.location.href = url;
}
