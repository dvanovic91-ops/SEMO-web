/**
 * 고객 노출용 주문번호 생성: 알파벳 1자 + 숫자 6자 (예: A123456, Z000001)
 * orders.order_number 컬럼에 저장·표시. 기존 주문(UUID만 있음)은 id 앞 8자로 폴백.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

function randomLetter(): string {
  return String.fromCharCode(65 + Math.floor(Math.random() * 26));
}

function randomDigits(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += Math.floor(Math.random() * 10);
  return s;
}

/** 유일한 주문번호 생성 (알파벳 1자 + 숫자 6자). 최대 5회 재시도 */
export async function generateOrderNumber(supabase: SupabaseClient | null): Promise<string> {
  if (!supabase) return randomLetter() + randomDigits(6);
  const maxTries = 5;
  for (let i = 0; i < maxTries; i++) {
    const candidate = randomLetter() + randomDigits(6);
    const { data } = await supabase.from('orders').select('id').eq('order_number', candidate).limit(1).maybeSingle();
    if (!data) return candidate;
  }
  return randomLetter() + randomDigits(6);
}
