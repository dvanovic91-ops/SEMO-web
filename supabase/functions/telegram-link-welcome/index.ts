// После успешного RPC link_telegram бот вызывает POST → sendMessage с приветствием.
// Текст синхронизировать с src/lib/telegramLinkNoticeRu.ts → TELEGRAM_LINK_SUCCESS_GREETING_RU

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
    'Vary': 'Origin',
  };
}

function json(res: object, status = 200, req: Request) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// ── 상수-시간 비교 (타이밍 공격 방지) ──
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode('semo-link-welcome'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign('HMAC', key, enc.encode(a)),
    crypto.subtle.sign('HMAC', key, enc.encode(b)),
  ]);
  const aa = new Uint8Array(sa), ba = new Uint8Array(sb);
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ ba[i];
  return diff === 0;
}

const GREETING_RU =
  'Привет! Ваш аккаунт успешно привязан. 🔐\nДля вашей безопасности используйте этот чат только на личном телефоне.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) });

  const secret = Deno.env.get('TELEGRAM_LINK_WELCOME_SECRET');
  const got = req.headers.get('x-telegram-bot-secret') ?? '';
  if (!secret || !got || !(await timingSafeEqual(got, secret))) {
    return json({ error: 'unauthorized' }, 401, req);
  }

  const token = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, 500, req);

  let telegram_id: string | null = null;
  try {
    const body = await req.json();
    telegram_id = typeof body.telegram_id === 'string' ? body.telegram_id : null;
  } catch {
    return json({ error: 'Invalid JSON' }, 400, req);
  }
  if (!telegram_id?.trim()) return json({ error: 'telegram_id required' }, 400, req);

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: telegram_id.trim(), text: GREETING_RU }),
  });
  const tgData = await tgRes.json();
  if (!tgRes.ok || !tgData.ok) return json({ error: 'Telegram send failed' }, 502, req);
  return json({ ok: true, sent: true }, 200, req);
});
