/**
 * 사이트 리전 — 동일 코드베이스를 두 배포로 분리하기 위한 플래그.
 *
 * - `global` (.com): 글로벌(CIS 기타·중동 등). 데이터 저장 = Supabase(글로벌).
 * - `ru` (.ru): 러시아/벨라루스. 데이터 저장 = 얀덱스 클라우드(자체호스트 Supabase).
 *
 * 빌드/배포별 환경변수로 결정한다 (`VITE_SITE_REGION`). 미설정 시 안전하게 글로벌.
 * 각 배포는 자신의 백엔드(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)만 바라보므로,
 * 러시아 개인정보가 글로벌 DB로 흘러가지 않는다(152-FZ 현지화 대응).
 */
export type SiteRegion = 'global' | 'ru';

const rawRegion = (import.meta.env.VITE_SITE_REGION ?? '').trim().toLowerCase();

export const SITE_REGION: SiteRegion = rawRegion === 'ru' ? 'ru' : 'global';

export const IS_RU_REGION = SITE_REGION === 'ru';
