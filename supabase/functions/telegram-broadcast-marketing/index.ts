/**
 * 마케팅 동의(telegram_notify_marketing)한 사용자에게만 유저 봇으로 공지 전송.
 * 인증: (1) 로그인 관리자 JWT 또는 (2) x-telegram-broadcast-secret + TELEGRAM_BROADCAST_SECRET (어드민 봇 등)
 */
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-broadcast-secret',
    'Vary': 'Origin',
  };
}

function json(res: object, status: number, req: Request) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('semo-tg-broadcast'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const botToken = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  const sharedSecret = Deno.env.get('TELEGRAM_BROADCAST_SECRET') ?? '';

  if (!supabaseUrl || !serviceRole || !botToken) {
    return json({ error: 'server misconfigured' }, 500, req);
  }

  let title = '';
  let body = '';
  try {
    const j = await req.json();
    title = (j.title ?? '').toString().trim();
    body = (j.body ?? '').toString().trim();
  } catch {
    return json({ error: 'invalid json' }, 400, req);
  }
  if (!title) return json({ error: 'title required' }, 400, req);

  const headerSecret = req.headers.get('x-telegram-broadcast-secret') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  let allowed = false;

  if (sharedSecret && headerSecret && (await timingSafeEqual(headerSecret, sharedSecret))) {
    allowed = true;
  } else if (bearer && bearer !== serviceRole) {
    const userClient = createClient(supabaseUrl, anonKey || serviceRole, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData.user?.id;
    if (uid) {
      const admin = createClient(supabaseUrl, serviceRole);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', uid).maybeSingle();
      if (prof?.is_admin === true) allowed = true;
    }
  }

  if (!allowed) return json({ error: 'forbidden' }, 403, req);

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: rows, error: qErr } = await admin
    .from('profiles')
    .select('telegram_id')
    .not('telegram_id', 'is', null)
    .eq('telegram_notify_marketing', true);

  if (qErr) return json({ error: qErr.message }, 500, req);

  const ids = (rows ?? [])
    .map((r: { telegram_id: string | null }) => r.telegram_id)
    .filter((id): id is string => !!id && String(id).length > 0);

  // Markdown 없이 전송(특수문자 깨짐 방지)
  const text = body ? `📢 ${title}\n\n${body}` : `📢 ${title}`;
  let sent = 0;

  for (const chatId of ids) {
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const tgData = await tgRes.json();
    if (tgRes.ok && tgData.ok) sent += 1;
    await new Promise((r) => setTimeout(r, 45));
  }

  return json({ ok: true, sent, total: ids.length }, 200, req);
});
