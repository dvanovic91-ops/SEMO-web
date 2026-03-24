/**
 * 피부 타입별 추천 상품 매칭 — **뷰티박스(Beauty box) 슬롯만** 사용한다.
 * 핏/헤어와 동일 테이블에서 `catalog_room` 컬럼으로만 구분 (catalog_room_slots).
 *
 * - 슬롯 1 = 상품 1, 슬롯 2 = 상품 2, … (뷰티 슬롯의 slot_index 순)
 * - 운영 단일 소스: DB skin_type_slot_mapping + 관리자 «테스트 매칭» 탭(뷰티 전용)
 * - RPC: docs/SUPABASE_RPC_SKIN_RECOMMEND_PRODUCT.sql
 */
/** 피부테스트·추천 RPC·클라이언트 폴백이 참조하는 카탈로그 — 항상 뷰티박스 */
export const SKIN_TEST_CATALOG_CATEGORY = 'beauty' as const;
/** 피부타입 → 슬롯 번호(1~5). 예: DRNT·DSNW → 상품1, OSNW·ORNT → 상품2. 나머지는 필요 시 1~5로 수정 */
export const SKIN_TYPE_SLOT_INDEX: Record<string, number> = {
  DRNT: 1,
  DSNW: 1,
  OSNW: 2,
  ORNT: 2,
  DSPW: 1,
  DSPT: 1,
  DSNT: 1,
  DRPW: 1,
  DRPT: 1,
  DRNW: 1,
  OSPW: 1,
  OSPT: 1,
  OSNT: 1,
  ORPW: 1,
  ORPT: 1,
  ORNW: 1,
};

/** 피부타입에 대한 추천 페이지 경로 */
export function getRecommendationPath(skinType: string | null): string {
  const normalized = (skinType ?? '').trim().toUpperCase();
  if (!normalized) return '/recommendations';
  return `/recommendations/${encodeURIComponent(normalized)}`;
}

/** 전체 피부타입 코드 목록 (관리자 매칭 UI용) */
export const ALL_SKIN_TYPES = Object.keys(SKIN_TYPE_SLOT_INDEX) as string[];

/** 피부타입 → 슬롯 번호(1~5). 없으면 null */
export function getRecommendationSlotIndex(skinType: string | null): number | null {
  const normalized = (skinType ?? '').trim().toUpperCase();
  if (!normalized) return null;
  const slot = SKIN_TYPE_SLOT_INDEX[normalized];
  return slot >= 1 && slot <= 5 ? slot : null;
}
