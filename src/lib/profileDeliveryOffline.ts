/**
 * 배송·프로필 상세 저장 실패 시에만 localStorage에 잠시 보관했다가
 * 온라인 복구 후 서버로 재전송하기 위한 모듈 (일반 경로의 진실은 Supabase).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertShippingAddressRow } from './profileDeliveryDb';

const PREFIX = 'semo_pending_shipping_v1';

export type PendingShippingPayload = {
  /** ISO 시각 — 디버깅·만료 판단용 */
  savedAt: string;
  userId: string;
  /** profiles.name, profiles.phone 과 shipping_addresses 필드 */
  profilesPatch: { name?: string | null; phone?: string | null };
  shippingPatch: Record<string, string | null>;
};

function key(userId: string): string {
  return `${PREFIX}:${userId}`;
}

/** 저장 실패 시에만 호출 — 네트워크/서버 오류 시 임시 백업 */
export function savePendingShippingBackup(userId: string, payload: Omit<PendingShippingPayload, 'savedAt'>): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    const full: PendingShippingPayload = {
      ...payload,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(key(userId), JSON.stringify(full));
  } catch {
    /* private mode 등 */
  }
}

export function loadPendingShippingBackup(userId: string): PendingShippingPayload | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingShippingPayload;
    if (!p?.userId || p.userId !== userId) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearPendingShippingBackup(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* */
  }
}

/**
 * 연결 복구 시 호출 — pending 이 있으면 서버에 반영 후 로컬 삭제.
 * @returns true 이면 최소 한 번 성공적으로 플러시됨
 */
export async function flushPendingShippingBackup(
  supabase: SupabaseClient | null,
  userId: string | null
): Promise<boolean> {
  if (!supabase || !userId) return false;
  const pending = loadPendingShippingBackup(userId);
  if (!pending) return false;

  try {
    const { profilesPatch, shippingPatch } = pending;
    if (Object.keys(profilesPatch).length > 0) {
      const { error } = await supabase.from('profiles').update(profilesPatch).eq('id', userId);
      if (error) throw error;
    }
    const err = await upsertShippingAddressRow(supabase, userId, shippingPatch);
    if (err) throw err;
    clearPendingShippingBackup(userId);
    return true;
  } catch {
    return false;
  }
}
