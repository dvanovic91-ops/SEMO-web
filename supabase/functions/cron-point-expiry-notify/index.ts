// 포인트 소멸 예정(7일 이내) 유저에게 텔레그램 알림 — 현재 기능 OFF.
// 켜려면 시크릿 POINT_EXPIRY_NOTIFY_ENABLED=true 로 설정 후, cron은 오후 5~6시(17:00~18:00) 권장.

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

  // 기능 OFF: 알림 폭탄 방지. 켜려면 시크릿에 POINT_EXPIRY_NOTIFY_ENABLED=true 설정
  if (Deno.env.get('POINT_EXPIRY_NOTIFY_ENABLED') !== 'true') {
    return json({ ok: true, disabled: true, message: 'point expiry notify is off' });
  }

  const token = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500);

  const supabase = createClient(supabaseUrl, serviceRole);

  // points_expires_at이 7일 이내인 프로필 조회 (telegram_id 있는 경우만)
  const { data: profiles, error: qErr } = await supabase
    .from('profiles')
    .select('id, telegram_id, points, points_expires_at, telegram_notify_marketing')
    .not('telegram_id', 'is', null)
    .eq('telegram_notify_marketing', true)
    .not('points_expires_at', 'is', null)
    .gte('points_expires_at', new Date().toISOString())
    .lte('points_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

  if (qErr) return json({ error: qErr.message }, 500);
  if (!profiles?.length) return json({ ok: true, sent: 0 });

  let sent = 0;
  for (const p of profiles) {
    const expiresAt = p.points_expires_at ? new Date(p.points_expires_at).toLocaleDateString('ru-RU') : '';
    const text = `⏳ Напоминание: ваши баллы (${p.points ?? 0}) истекают ${expiresAt}. Используйте их в разделе «Магазин».`;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: p.telegram_id, text }),
    });
    const data = await res.json();
    if (res.ok && data.ok) sent += 1;
  }
  return json({ ok: true, sent, total: profiles.length });
});
