// Supabase Edge Function: 주문 생성/변경 시 유저 텔레그램으로 알림 발송
// Database Webhook(orders INSERT) 또는 앱에서 POST { order_id } 호출

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS (semo-box.com + 로컬 개발) ──
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-order-secret',
    'Vary': 'Origin',
  };
}

function json(res: object, status = 200, req: Request) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// ── Rate limiter (IP당 분당 30회) ──
const rlStore = new Map<string, { count: number; resetAt: number }>();
function isRateLimited(ip: string, max = 30): boolean {
  const now = Date.now();
  const e = rlStore.get(ip);
  if (!e || now > e.resetAt) { rlStore.set(ip, { count: 1, resetAt: now + 60_000 }); return false; }
  if (e.count >= max) return true;
  e.count++;
  return false;
}
function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

// ── 상수-시간 비교 (타이밍 공격 방지) ──
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('semo-notify-order'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const aa = new Uint8Array(sa), ba = new Uint8Array(sb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ ba[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) });

  const ip = getClientIp(req);
  if (isRateLimited(ip, 30)) return json({ error: 'rate_limited' }, 429, req);

  // ── 인증: x-notify-order-secret 헤더 또는 Database Webhook authorization ──
  const secret = Deno.env.get('NOTIFY_ORDER_SECRET');
  if (!secret) return json({ error: 'NOTIFY_ORDER_SECRET not configured' }, 500, req);

  const gotSecret = req.headers.get('x-notify-order-secret') ?? '';
  const secretOk = gotSecret.length > 0 && (await timingSafeEqual(gotSecret, secret));

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500, req);

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  let jwtUserId: string | null = null;
  if (!secretOk && bearer && anonKey) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (!uErr && u.user?.id) jwtUserId = u.user.id;
  }

  if (!secretOk && !jwtUserId) {
    return json({ error: 'unauthorized' }, 401, req);
  }

  const token = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, 500, req);

  let user_id: string | null = null;
  let order_id: string | null = null;
  let order_total: number | undefined;
  try {
    const body = await req.json();
    // Database Webhook 페이로드: { type: 'INSERT', table: 'orders', record: { id, user_id, ... } }
    if (body.record?.user_id) {
      if (!secretOk) return json({ error: 'unauthorized' }, 401, req);
      user_id = body.record.user_id;
      order_id = body.record.id ?? null;
      order_total = body.record.total_cents;
    } else {
      user_id = body.user_id ?? null;
      order_id = body.order_id ?? null;
      order_total = body.total_cents;
    }
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, req);
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  // JWT 경로: 임의 user_id 스팸 방지 — order_id로만 조회 후 소유자 일치 검사
  if (jwtUserId && !secretOk) {
    if (!order_id) return json({ error: 'order_id required for user session' }, 400, req);
    const { data: ord } = await supabase.from('orders').select('user_id, total_cents').eq('id', order_id).single();
    if (!ord || ord.user_id !== jwtUserId) return json({ error: 'forbidden' }, 403, req);
    user_id = ord.user_id;
    if (order_total == null) order_total = ord.total_cents;
  }
  if (!user_id && order_id) {
    const { data: order } = await supabase.from('orders').select('user_id, total_cents').eq('id', order_id).single();
    if (order) {
      user_id = order.user_id;
      if (order_total == null) order_total = order.total_cents;
    }
  }
  if (!user_id) return json({ error: 'user_id or order_id required' }, 400, req);

  const { data: profile } = await supabase
    .from('profiles')
    .select('telegram_id, telegram_notify_orders')
    .eq('id', user_id)
    .single();
  const telegram_id = profile?.telegram_id ?? null;
  if (!telegram_id) return json({ ok: true, sent: false, reason: 'no_telegram' }, 200, req);
  if (profile?.telegram_notify_orders === false) {
    return json({ ok: true, sent: false, reason: 'orders_notifications_off' }, 200, req);
  }

  const totalStr = order_total != null ? `\nСумма: ${(order_total / 100).toFixed(0)} ₽` : '';
  const text = `✅ Заказ оформлен!\nНомер: ${order_id ?? '—'}${totalStr}\nПодробности в личном кабинете.`;

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegram_id, text, parse_mode: 'HTML' }),
  });
  const tgData = await tgRes.json();
  if (!tgRes.ok || !tgData.ok) return json({ error: 'Telegram send failed' }, 502, req);
  return json({ ok: true, sent: true }, 200, req);
});
