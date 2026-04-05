// Bot -> Edge Function:
// 1) validate deep-link token
// 2) link telegram account via RPC link_telegram
// 3) save phone from Telegram contact share
// 4) save notification prefs: orders always on at link; marketing from body

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS (semo-box.com + 로컬 개발) ──
const ALLOWED_ORIGINS = new Set([
  'https://semo-box.com',
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

// ── Rate limiter (IP당 분당 20회) ──
const rlStore = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, maxPerMinute = 20): boolean {
  const now = Date.now();
  const entry = rlStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rlStore.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= maxPerMinute) return true;
  entry.count++;
  return false;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

/** RU 11자리(7/8로 시작)만 공백 포맷; 그 외 국가는 +국번 그대로(7 강제 없음). */
function normalizePhoneForProfile(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 11 && (digits.startsWith('8') || digits.startsWith('7'))) {
    if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
    const a = digits.slice(0, 1);
    const b = digits.slice(1, 4);
    const c = digits.slice(4, 7);
    const d = digits.slice(7, 11);
    return `+${a} ${b} ${c} ${d}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) });

  const ip = getClientIp(req);
  if (isRateLimited(ip, 20)) return json({ error: 'rate_limited' }, 429, req);

  const secret = Deno.env.get('TELEGRAM_LINK_CONSENT_SECRET');
  const got = req.headers.get('x-telegram-bot-secret') ?? '';
  if (!secret || got !== secret) return json({ error: 'unauthorized' }, 401, req);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500, req);
  const supabase = createClient(supabaseUrl, serviceRole);

  let token: string | null = null;
  let telegram_id: string | null = null;
  let phone: string | null = null;
  let consent_marketing = false;
  try {
    const body = await req.json();
    token = typeof body.token === 'string' ? body.token : null;
    telegram_id = typeof body.telegram_id === 'string' ? body.telegram_id : null;
    phone = typeof body.phone === 'string' ? body.phone : null;
    if (typeof body.consent_marketing === 'boolean') consent_marketing = body.consent_marketing;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, req);
  }

  if (!token?.trim()) return json({ error: 'token required' }, 400, req);
  if (!telegram_id?.trim()) return json({ error: 'telegram_id required' }, 400, req);

  const normalizedPhone = normalizePhoneForProfile(phone);
  if (!normalizedPhone) {
    return json({ error: 'phone invalid or too short (use Telegram contact share)' }, 400, req);
  }

  const { data: linkRow, error: linkErr } = await supabase
    .from('link_tokens')
    .select('user_id, expires_at')
    .eq('token', token.trim())
    .maybeSingle();
  if (linkErr) return json({ error: 'link_tokens query failed', details: linkErr.message }, 500, req);
  if (!linkRow?.user_id) return json({ error: 'invalid_or_expired_token' }, 400, req);

  const expiresAt = new Date(linkRow.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return json({ error: 'invalid_or_expired_token' }, 400, req);
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('link_telegram', {
    p_token: token.trim(),
    p_telegram_id: telegram_id.trim(),
  });
  if (rpcErr) return json({ error: 'link_telegram_failed', details: rpcErr.message }, 500, req);
  if (!rpcData?.ok) return json({ error: rpcData?.error ?? 'link_telegram_failed' }, 400, req);

  const patch = {
    phone: normalizedPhone,
    phone_verified: true,
    telegram_notify_orders: true,
    telegram_notify_marketing: consent_marketing,
  };
  const { error: updErr } = await supabase.from('profiles').update(patch).eq('id', linkRow.user_id);
  if (updErr) return json({ error: 'profile_update_failed', details: updErr.message }, 500, req);

  return json({
    ok: true,
    user_id: linkRow.user_id,
    telegram_id: telegram_id.trim(),
    phone: normalizedPhone,
    consent_orders: true,
    consent_marketing,
    message:
      'linked_with_consent; user can change notification preferences later in profile settings',
  }, 200, req);
});
