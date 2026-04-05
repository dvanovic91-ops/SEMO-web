// 포인트 소멸 예정(7일 이내) 유저에게 텔레그램 알림 — 현재 기능 OFF.
// 켜려면: POINT_EXPIRY_NOTIFY_ENABLED=true + CRON_POINT_EXPIRY_SECRET 설정 후 cron 호출 시 헤더 x-cron-point-expiry-secret 전달.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set([
  'https://semo-box.com',
  'https://semo-box.ru',
  'http://localhost:5173',
  'http://localhost:3001',
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://semo-box.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-point-expiry-secret',
    'Vary': 'Origin',
  };
}

function json(res: object, status = 200, req: Request) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('semo-cron-point-expiry'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const aa = new Uint8Array(sa);
  const ba = new Uint8Array(sb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ ba[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) });

  const secret = Deno.env.get('CRON_POINT_EXPIRY_SECRET');
  if (!secret) return json({ error: 'CRON_POINT_EXPIRY_SECRET not configured' }, 500, req);

  const got = req.headers.get('x-cron-point-expiry-secret') ?? '';
  if (!got || !(await timingSafeEqual(got, secret))) {
    return json({ error: 'unauthorized' }, 401, req);
  }

  if (Deno.env.get('POINT_EXPIRY_NOTIFY_ENABLED') !== 'true') {
    return json({ ok: true, disabled: true, message: 'point expiry notify is off' }, 200, req);
  }

  const token = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, 500, req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500, req);

  const supabase = createClient(supabaseUrl, serviceRole);

  const { data: profiles, error: qErr } = await supabase
    .from('profiles')
    .select('id, telegram_id, points, points_expires_at, telegram_notify_marketing')
    .not('telegram_id', 'is', null)
    .eq('telegram_notify_marketing', true)
    .not('points_expires_at', 'is', null)
    .gte('points_expires_at', new Date().toISOString())
    .lte('points_expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

  if (qErr) return json({ error: qErr.message }, 500, req);
  if (!profiles?.length) return json({ ok: true, sent: 0 }, 200, req);

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
  return json({ ok: true, sent, total: profiles.length }, 200, req);
});
