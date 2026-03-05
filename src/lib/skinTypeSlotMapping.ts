/**
 * 피부 타입–슬롯 매칭: DB(skin_type_slot_mapping) 우선, 없으면 config fallback.
 */
import { supabase } from './supabase';
import { getRecommendationSlotIndex } from '../config/skinTypeRecommendations';

const TABLE = 'skin_type_slot_mapping';

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
