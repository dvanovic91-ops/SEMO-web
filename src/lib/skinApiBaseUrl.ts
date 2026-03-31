/**
 * 피부 분석 Flask API 베이스 URL (끝 슬래시 없음).
 * - `VITE_SKIN_API_URL`이 있으면 그대로 사용 (로컬 Flask·배포 API URL 등).
 * - 비어 있을 때:
 *   - `vite` 개발 서버(`npm run dev`): `/skin-api` — `vite.config.ts`가 127.0.0.1:5001로 프록시 (CORS·mixed content 회피).
 *   - 프로덕션 빌드: 배포 시에는 반드시 `.env`에 `VITE_SKIN_API_URL`을 넣거나, 서버에서 `/skin-api` 역프록시를 맞추세요.
 *   - 그 외(프리뷰·정적 호스팅 등) 기본 GCP VM (레거시).
 */
export function getSkinApiBaseUrl(): string {
  const raw = import.meta.env.VITE_SKIN_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  if (import.meta.env.DEV) return '/skin-api';
  return 'https://declive-maura-irksomely.ngrok-free.dev';
}
