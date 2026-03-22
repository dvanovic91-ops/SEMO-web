// Supabase Edge Function: 주문 생성/변경 시 유저 텔레그램으로 알림 발송
// Database Webhook(orders INSERT) 또는 앱에서 POST { order_id } 호출

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(res: object, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const token = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500);

  let user_id: string | null = null;
  let order_id: string | null = null;
  let order_total: number | undefined;
  try {
    const body = await req.json();
    // Database Webhook 페이로드: { type: 'INSERT', table: 'orders', record: { id, user_id, ... } }
    if (body.record?.user_id) {
      user_id = body.record.user_id;
      order_id = body.record.id ?? null;
      order_total = body.record.total_cents;
    } else {
      user_id = body.user_id ?? null;
      order_id = body.order_id ?? null;
      order_total = body.total_cents;
    }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  // order_id만 온 경우 orders에서 user_id 조회
  if (!user_id && order_id) {
    const { data: order } = await supabase.from('orders').select('user_id, total_cents').eq('id', order_id).single();
    if (order) {
      user_id = order.user_id;
      if (order_total == null) order_total = order.total_cents;
    }
  }
  if (!user_id) return json({ error: 'user_id or order_id required' }, 400);

  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_id, telegram_notify_orders')
    .eq('id', user_id)
    .single();
  const telegram_id = profile?.telegram_id ?? null;
  if (!telegram_id) return json({ ok: true, sent: false, reason: 'no_telegram' });
  if (profile?.telegram_notify_orders === false) {
    return json({ ok: true, sent: false, reason: 'orders_notifications_off' });
  }

  const totalStr = order_total != null ? `\nСумма: ${(order_total / 100).toFixed(0)} ₽` : '';
  const text = `✅ Заказ оформлен!\nНомер: ${order_id ?? '—'}${totalStr}\nПодробности в личном кабинете.`;

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegram_id, text, parse_mode: 'HTML' }),
  });
  const tgData = await tgRes.json();
  if (!tgRes.ok || !tgData.ok) return json({ error: 'Telegram send failed', details: tgData }, 502);
  return json({ ok: true, sent: true });
});
