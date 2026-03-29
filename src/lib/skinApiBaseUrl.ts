/**
 * 피부 분석 Flask API 베이스 URL (끝 슬래시 없음).
 * - `VITE_SKIN_API_URL`이 있으면 우선 사용 (별도 API 도메인·HTTPS).
 * - 비어 있으면 `/skin-api` (같은 사이트) — Vite dev/preview는 프록시로 5001에 연결; 프로덕션은 호스트에서 `/skin-api` 역프록시를 두거나 .env에 전체 URL 지정.
 */
export function getSkinApiBaseUrl(): string {
  const raw = import.meta.env.VITE_SKIN_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return '/skin-api';
}
