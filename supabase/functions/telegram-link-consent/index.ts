// Bot -> Edge Function:
// 1) validate deep-link token
// 2) link telegram account via RPC link_telegram
// 3) save phone from Telegram contact share
// 4) save notification prefs: orders always on at link; marketing from body

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
};

function json(res: object, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const secret = Deno.env.get('TELEGRAM_LINK_CONSENT_SECRET');
  const got = req.headers.get('x-telegram-bot-secret') ?? '';
  if (!secret || got !== secret) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500);
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
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!token?.trim()) return json({ error: 'token required' }, 400);
  if (!telegram_id?.trim()) return json({ error: 'telegram_id required' }, 400);

  const normalizedPhone = normalizePhoneForProfile(phone);
  if (!normalizedPhone) {
    return json({ error: 'phone invalid or too short (use Telegram contact share)' }, 400);
  }

  const { data: linkRow, error: linkErr } = await supabase
    .from('link_tokens')
    .select('user_id, expires_at')
    .eq('token', token.trim())
    .maybeSingle();
  if (linkErr) return json({ error: 'link_tokens query failed', details: linkErr.message }, 500);
  if (!linkRow?.user_id) return json({ error: 'invalid_or_expired_token' }, 400);

  const expiresAt = new Date(linkRow.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return json({ error: 'invalid_or_expired_token' }, 400);
  }

  const { data: rpcData, error: rpcErr } = await supabase.rpc('link_telegram', {
    p_token: token.trim(),
    p_telegram_id: telegram_id.trim(),
  });
  if (rpcErr) return json({ error: 'link_telegram_failed', details: rpcErr.message }, 500);
  if (!rpcData?.ok) return json({ error: rpcData?.error ?? 'link_telegram_failed' }, 400);

  // При привязке заказы/доставка всегда on; «новинки» — только consent_marketing (как в user_bot save_phone_and_consents_after_link).
  const patch = {
    phone: normalizedPhone,
    phone_verified: true,
    telegram_notify_orders: true,
    telegram_notify_marketing: consent_marketing,
  };
  const { error: updErr } = await supabase.from('profiles').update(patch).eq('id', linkRow.user_id);
  if (updErr) return json({ error: 'profile_update_failed', details: updErr.message }, 500);

  return json({
    ok: true,
    user_id: linkRow.user_id,
    telegram_id: telegram_id.trim(),
    phone: normalizedPhone,
    consent_orders: true,
    consent_marketing,
    message:
      'linked_with_consent; user can change notification preferences later in profile settings',
  });
});

