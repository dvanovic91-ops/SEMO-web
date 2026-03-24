/**
 * 샵 카탈로그 슬롯 — **한 테이블** `catalog_room_slots` + `catalog_room` 으로 룸 분리.
 * `(catalog_room, slot_index)` 유니크로 같은 룸 안에서만 순서가 잡히고, 쿼리는 항상 `.eq('catalog_room', …)` 로 고정.
 *
 * Supabase: docs/SUPABASE_CATALOG_ROOM_SLOTS.sql (또는 supabase/migrations 동명 로직) 실행.
 */
export type CatalogSlotRoom = 'beauty' | 'inner_beauty' | 'hair_beauty';

/** 단일 슬롯 테이블 (PostgREST 이름) */
export const CATALOG_ROOM_SLOTS_TABLE = 'catalog_room_slots' as const;

/**
 * 룸별 «카탈로그에 노출할 슬롯 개수»(1~7). DB `catalog_room_slots` 는 항상 0..6 행까지 유지해
 * 노출만 줄였다 늘렸다 할 때 숨긴 슬롯 메타(커버 이미지 등)가 지워지지 않게 함.
 */
export const CATALOG_SLOT_VISIBLE_BY_ROOM_KEY = 'catalog_slot_visible_by_room' as const;

/** `(catalog_room, slot_index)` 스키마상 한 룸당 최대 슬롯 인덱스 0~(값-1), 예: 7이면 0~6 */
export const CATALOG_SLOT_ROW_PERSIST = 7 as const;

/** 과거 박스 시즌 버킷 N-1, N-2, N-3 — site_settings 키 */
export const BOX_HISTORY_SEASON_LABELS_KEY = 'box_history_season_labels' as const;
export const HISTORY_SEASON_COUNT = 3 as const;
/** 시즌당 최대 박스 수(관리자·프론트 검증) */
export const HISTORY_SEASON_MAX_PRODUCTS = 6 as const;

export function parseCatalogVisibleByRoom(raw: unknown): Partial<Record<CatalogSlotRoom, number>> {
  if (raw == null) return {};
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return {};
    const out: Partial<Record<CatalogSlotRoom, number>> = {};
    for (const k of ['beauty', 'inner_beauty', 'hair_beauty'] as CatalogSlotRoom[]) {
      const n = Number((o as Record<string, unknown>)[k]);
      if (Number.isFinite(n)) {
        const c = Math.floor(n);
        if (c >= 1 && c <= CATALOG_SLOT_ROW_PERSIST) out[k] = c;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 설정값 또는 폴백을 1~CATALOG_SLOT_ROW_PERSIST 로 고정 */
export function clampCatalogVisibleCount(n: number, fallback: number): number {
  const f = Math.min(CATALOG_SLOT_ROW_PERSIST, Math.max(1, Math.floor(fallback)));
  if (!Number.isFinite(n)) return f;
  return Math.min(CATALOG_SLOT_ROW_PERSIST, Math.max(1, Math.floor(n)));
}
