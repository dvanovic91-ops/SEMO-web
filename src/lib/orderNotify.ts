/**
 * 주문 생성 후 텔레그램 알림 요청.
 * Supabase Edge Function "notify-order"를 호출합니다.
 * 실제 주문 INSERT를 하는 코드에서 insert 성공 후 이 함수를 호출하면 됩니다.
 */
import { supabase } from './supabase';

export async function notifyOrderCreated(orderId: string): Promise<{ ok: boolean; sent?: boolean }> {
  if (!supabase) return { ok: false };
  const { data, error } = await supabase.functions.invoke('notify-order', {
    body: { order_id: orderId },
  });
  if (error) return { ok: false };
  return (data as { ok: boolean; sent?: boolean }) ?? { ok: false };
}
