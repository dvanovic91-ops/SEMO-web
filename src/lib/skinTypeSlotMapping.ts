/**
 * 피부 타입–슬롯 매칭: DB(skin_type_slot_mapping) 우선, 없으면 config fallback.
 * 뷰티 슬롯은 **catalog_room_slots** 에서 `catalog_room = 'beauty'` 행만 사용.
 */
import { supabase } from './supabase';
import { CATALOG_ROOM_SLOTS_TABLE } from './catalogSlotRooms';
import { getRecommendationSlotIndex, SKIN_TEST_CATALOG_CATEGORY } from '../config/skinTypeRecommendations';

const TABLE = 'skin_type_slot_mapping';

/**
 * 피부 타입에 맞는 추천 상품 UUID.
 * Supabase RPC `get_recommended_product_id_for_skin_type` 우선(봇·웹 동일 규칙),
 * 실패·null 시 catalog_room_slots(뷰티) + 슬롯 매핑으로 클라이언트 계산(폴백).
 */
export async function getRecommendedProductIdForSkinType(skinType: string | null): Promise<string | null> {
  const normalized = (skinType ?? '').trim().toUpperCase();
  if (!normalized) return null;

  if (supabase) {
    const { data, error } = await supabase.rpc('get_recommended_product_id_for_skin_type', {
      p_skin_type: normalized,
    });
    if (!error && data != null) {
      const id = String(data).trim();
      if (id) {
        // RPC가 category 필터 없이 배포된 경우 inner_beauty 등이 나올 수 있음 → 뷰티박스만 허용
        const r1 = await supabase.from('products').select('category, box_history').eq('id', id).maybeSingle();
        let prow: { category?: string | null; box_history?: boolean | null } | null = r1.data as typeof prow;
        if (r1.error) {
          const r2 = await supabase.from('products').select('category').eq('id', id).maybeSingle();
          prow = r2.data as typeof prow;
        }
        if (prow) {
          const row = prow as { category?: string | null; box_history?: boolean | null };
          if (row.box_history) {
            // 과거 시즌 박스는 추천·테스트 매칭에서 제외 → 아래 슬롯 폴백
          } else {
            const cat = row.category;
            if (cat == null || cat === SKIN_TEST_CATALOG_CATEGORY) return id;
          }
        }
        // 상품 행을 읽지 못함(RLS 등)이거나 inner_beauty 등 → RPC 결과 무시하고 뷰티 슬롯 폴백
      }
    }
  }

  const slotIndex = await getSlotIndexForSkinType(normalized);
  if (slotIndex == null || slotIndex < 1 || !supabase) return null;

  const { data: slotRows, error: slotErr } = await supabase
    .from(CATALOG_ROOM_SLOTS_TABLE)
    .select('slot_index, product_id')
    .eq('catalog_room', SKIN_TEST_CATALOG_CATEGORY)
    .order('slot_index', { ascending: true });

  if (slotErr) return null;
  const rows = ((slotRows ?? []) as { slot_index: number; product_id: string | null }[])
    .slice()
    .sort((a, b) => a.slot_index - b.slot_index);
  if (rows.length === 0 || slotIndex > rows.length) return null;
  const row = rows[slotIndex - 1];
  const pid = row?.product_id ?? null;
  if (!pid) return null;
  const { data: pRow, error: pRowErr } = await supabase.from('products').select('box_history').eq('id', pid).maybeSingle();
  if (pRowErr) return pid;
  const bh = (pRow as { box_history?: boolean | null } | null)?.box_history;
  if (bh) return null;
  return pid;
}

/** DB에서 해당 피부타입의 슬롯 번호(1~5) 조회. 없으면 config 값 반환. 오류 시 null */
export async function getSlotIndexForSkinType(skinType: string | null): Promise<number | null> {
  try {
    const normalized = (skinType ?? '').trim().toUpperCase();
    if (!normalized) return null;
    if (!supabase) return getRecommendationSlotIndex(skinType);
    const { data, error } = await supabase
      .from(TABLE)
      .select('slot_index')
      .eq('skin_type', normalized)
      .maybeSingle();
    if (error) return getRecommendationSlotIndex(skinType);
    if (data != null && typeof (data as { slot_index: number }).slot_index === 'number') {
      const slot = (data as { slot_index: number }).slot_index;
      return slot >= 1 && slot <= 5 ? slot : getRecommendationSlotIndex(skinType);
    }
    return getRecommendationSlotIndex(skinType);
  } catch {
    return getRecommendationSlotIndex(skinType);
  }
}

/** DB에서 전체 매칭 로드: { skin_type: slot_index } */
export async function fetchMapping(): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data } = await supabase.from(TABLE).select('skin_type, slot_index');
  const rows = (data ?? []) as { skin_type: string; slot_index: number }[];
  const out: Record<string, number> = {};
  rows.forEach((r) => {
    if (r.skin_type != null && r.slot_index >= 1 && r.slot_index <= 5) out[r.skin_type] = r.slot_index;
  });
  return out;
}

/** DB에서 지정 피부타입 매칭 행 삭제 (미매칭으로 옮긴 타입 저장 시 사용). 한 건씩 삭제해 RLS/호환성 보장 */
export async function deleteMappingForTypes(skinTypes: string[]): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error('Supabase not initialized') };
  if (skinTypes.length === 0) return { error: null };
  try {
    for (const skin_type of skinTypes) {
      const { error } = await supabase.from(TABLE).delete().eq('skin_type', skin_type);
      if (error) return { error: error as unknown as Error };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** DB에 매칭 일괄 저장 (upsert). slotByType[skin_type] = 1~5 */
export async function saveMapping(slotByType: Record<string, number>): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error('Supabase not initialized') };
  const rows = Object.entries(slotByType)
    .filter(([, slot]) => slot >= 1 && slot <= 5)
    .map(([skin_type, slot_index]) => ({ skin_type, slot_index }));
  if (rows.length === 0) return { error: null };
  try {
    const { error } = await supabase.from(TABLE).upsert(rows, {
      onConflict: 'skin_type',
    });
    return { error: error as unknown as Error | null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
