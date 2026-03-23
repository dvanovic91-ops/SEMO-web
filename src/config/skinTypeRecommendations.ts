/**
 * 피부 타입별 추천 상품 매칭 (Shop 슬롯 1~5 중 1개).
 * - 슬롯 1 = 상품 1, 슬롯 2 = 상품 2, … (main_layout_slots의 slot_index 0~4)
 * - 테스트 결과에서 피부타입에 따라 이 슬롯 번호로 매칭 → 해당 슬롯에 배치된 실제 상품 상세로 연결.
 * 나중에 매칭만 아래 숫자(1~5)로 바꾸면 됨.
 *
 * 운영 단일 소스: DB skin_type_slot_mapping 를 먼저 쓰고 (관리자 UI), 없을 때만 이 fallback.
 * 텔레그램 봇은 동일 규칙을 Supabase RPC get_recommended_product_id_for_skin_type 에 두었음
 * (docs/SUPABASE_RPC_SKIN_RECOMMEND_PRODUCT.sql). RPC의 CASE fallback 은 아래 SKIN_TYPE_SLOT_INDEX 와 맞출 것.
 */
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
