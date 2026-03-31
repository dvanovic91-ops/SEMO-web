/**
 * 피부 분석 Flask API 베이스 URL (끝 슬래시 없음).
 * - `VITE_SKIN_API_URL`이 있으면 우선 사용 (별도 API 도메인·HTTPS).
 * - 비어 있으면 GCP VM 주소 사용 (beautybox-bot, europe-west3-a).
 */
export function getSkinApiBaseUrl(): string {
  const raw = import.meta.env.VITE_SKIN_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, '');
  return 'http://34.141.14.157:5001';
}
