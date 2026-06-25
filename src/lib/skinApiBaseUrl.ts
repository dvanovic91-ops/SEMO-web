/**
 * 피부 분석 Flask API 베이스 URL (끝 슬래시 없음).
 * - `VITE_SKIN_API_URL`이 있으면 그대로 사용 (로컬 Flask·배포 API URL 등).
 * - 비어 있을 때:
 *   - `vite` 개발 서버(`npm run dev`): `/skin-api` — `vite.config.ts`가 127.0.0.1:5001로 프록시 (CORS·mixed content 회피).
 *   - 프로덕션 빌드: Cloudflare Tunnel을 통해 고정 도메인으로 제공.
 */
export function getSkinApiBaseUrl(): string {
  const raw = import.meta.env.VITE_SKIN_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  if (import.meta.env.DEV) return '/skin-api';
  return 'https://api.semo-box.com';
}

/** API 요청 기본 헤더 — X-API-Key는 VITE_SKIN_API_KEY 환경변수에서 주입 */
export const skinApiHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  ...(import.meta.env.VITE_SKIN_API_KEY
    ? { 'X-API-Key': import.meta.env.VITE_SKIN_API_KEY as string }
    : {}),
};

/**
 * `fetch`가 응답 전에 끊길 때(서버 미기동·CORS·URL 오류 등) 브라우저는 보통 `Failed to fetch`만 줍니다.
 * 관리 화면에서 원인 추적에 쓰일 짧은 한국어 안내로 바꿉니다.
 */
export function formatSkinApiNetworkError(err: unknown, baseUrl: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const isNetworkFail =
    (err instanceof TypeError && (msg === 'Failed to fetch' || msg === 'Load failed')) ||
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      err.name === 'NetworkError');

  if (isNetworkFail) {
    const hint = import.meta.env.DEV
      ? 'Vite dev 프록시(`/skin-api`)가 Oracle 서버(139.185.33.168:5001)에 연결되지 못했습니다. Oracle 서버 상태를 확인하거나 `npm run dev`를 재시작하세요.'
      : '`.env`의 `VITE_SKIN_API_URL` 또는 웹 서버의 `/skin-api` 역프록시가 올바른지 확인하세요.';
    return `피부 API에 연결할 수 없습니다. ${hint} (요청 베이스: ${baseUrl})`;
  }

  return msg || '요청 실패';
}
