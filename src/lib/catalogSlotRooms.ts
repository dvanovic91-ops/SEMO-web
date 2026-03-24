/**
 * 샵 카탈로그 슬롯 — **한 테이블** `catalog_room_slots` + `catalog_room` 으로 룸 분리.
 * `(catalog_room, slot_index)` 유니크로 같은 룸 안에서만 순서가 잡히고, 쿼리는 항상 `.eq('catalog_room', …)` 로 고정.
 *
 * Supabase: docs/SUPABASE_CATALOG_ROOM_SLOTS.sql (또는 supabase/migrations 동명 로직) 실행.
 */
export type CatalogSlotRoom = 'beauty' | 'inner_beauty' | 'hair_beauty';

/** 단일 슬롯 테이블 (PostgREST 이름) */
export const CATALOG_ROOM_SLOTS_TABLE = 'catalog_room_slots' as const;
