// ============================================================
//  Telegram Auth — Widget Login + Mini App Auto-Login
//  1) Verify Telegram hash (widget or miniapp mode)
//  2) Find or create Supabase user
//  3) Return magiclink token_hash for frontend verifyOtp
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(res: object, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// ── Crypto helpers (Deno / Web Crypto API) ──

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key instanceof Uint8Array ? key : new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function sha256(data: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
}

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Telegram hash verification ──

async function verifyWidgetHash(
  botToken: string,
  data: Record<string, string>,
): Promise<boolean> {
  const hash = data.hash;
  if (!hash) return false;
  const checkArr = Object.entries(data)
    .filter(([k]) => k !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const checkString = checkArr.join('\n');
  const secretKey = await sha256(botToken);
  const computed = bufToHex(await hmacSha256(secretKey, checkString));
  return computed === hash;
}

async function verifyMiniAppHash(
  botToken: string,
  initData: string,
): Promise<{ ok: boolean; user?: Record<string, unknown> }> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false };
  const checkArr: string[] = [];
  params.forEach((v, k) => {
    if (k !== 'hash') checkArr.push(`${k}=${v}`);
  });
  checkArr.sort();
  const checkString = checkArr.join('\n');
  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const computed = bufToHex(await hmacSha256(secretKey, checkString));
  if (computed !== hash) return { ok: false };
  try {
    const userStr = params.get('user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { ok: true, user };
  } catch {
    return { ok: true };
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const botToken = Deno.env.get('TELEGRAM_USER_BOT_TOKEN') ?? Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!botToken) return json({ error: 'TELEGRAM_BOT_TOKEN not configured' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500);

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let mode: string;
  let widgetData: Record<string, string> | null = null;
  let miniAppInitData: string | null = null;

  try {
    const body = await req.json();
    mode = body.mode;
    if (mode === 'widget') widgetData = body.data;
    else if (mode === 'miniapp') miniAppInitData = body.data;
    else return json({ error: 'mode must be "widget" or "miniapp"' }, 400);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // ── 1. Verify hash ──
  let telegramId: string | null = null;
  let firstName = '';
  let lastName = '';
  let username = '';
  let photoUrl = '';

  if (mode === 'widget' && widgetData) {
    const valid = await verifyWidgetHash(botToken, widgetData);
    if (!valid) return json({ error: 'invalid_hash' }, 401);
    // Check auth_date freshness (5 minutes)
    const authDate = parseInt(widgetData.auth_date || '0', 10);
    if (Math.abs(Date.now() / 1000 - authDate) > 300) {
      return json({ error: 'auth_date_expired' }, 401);
    }
    telegramId = widgetData.id;
    firstName = widgetData.first_name || '';
    lastName = widgetData.last_name || '';
    username = widgetData.username || '';
    photoUrl = widgetData.photo_url || '';
  }

  if (mode === 'miniapp' && miniAppInitData) {
    const result = await verifyMiniAppHash(botToken, miniAppInitData);
    if (!result.ok) return json({ error: 'invalid_hash' }, 401);
    // Check auth_date
    const params = new URLSearchParams(miniAppInitData);
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (Math.abs(Date.now() / 1000 - authDate) > 300) {
      return json({ error: 'auth_date_expired' }, 401);
    }
    const user = result.user as Record<string, unknown> | undefined;
    telegramId = user?.id != null ? String(user.id) : null;
    firstName = (user?.first_name as string) || '';
    lastName = (user?.last_name as string) || '';
    username = (user?.username as string) || '';
    photoUrl = (user?.photo_url as string) || '';
  }

  if (!telegramId) return json({ error: 'telegram_id missing' }, 400);

  // ── 2. Find existing user by telegram_id ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  let userId: string;
  let userEmail: string;
  let isNew = false;

  if (profile?.id) {
    // Existing user
    userId = profile.id;
    // Get email from auth.users
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    userEmail = authUser?.user?.email || profile.email || `tg_${telegramId}@tg.semo-box.local`;
  } else {
    // ── 3. Create new user ──
    isNew = true;
    userEmail = `tg_${telegramId}@tg.semo-box.local`;
    const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || username || `TG_${telegramId}`;

    // Generate random password (user won't need it — they login via Telegram)
    const randomPwd = bufToHex(crypto.getRandomValues(new Uint8Array(32)));

    const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
      email: userEmail,
      password: randomPwd,
      email_confirm: true,
      user_metadata: { nickname: displayName, telegram_id: telegramId },
    });

    if (createErr || !newUser?.user?.id) {
      // Maybe race condition — try lookup again
      const { data: retryProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('telegram_id', telegramId)
        .maybeSingle();
      if (retryProfile?.id) {
        userId = retryProfile.id;
        isNew = false;
      } else {
        return json({ error: 'user_creation_failed', details: createErr?.message }, 500);
      }
    } else {
      userId = newUser.user.id;
    }

    // Update profile with telegram_id and name
    // (handle_new_user trigger already created the row, but telegram_id might not be set)
    await supabase.from('profiles').update({
      telegram_id: telegramId,
      name: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
    }).eq('id', userId!);
  }

  // ── 4. Generate magiclink for session ──
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userEmail,
  });

  if (linkErr || !linkData) {
    return json({ error: 'magiclink_failed', details: linkErr?.message }, 500);
  }

  // Extract token_hash from the generated link
  const tokenHash = linkData.properties?.hashed_token;
  if (!tokenHash) {
    return json({ error: 'no_token_hash' }, 500);
  }

  return json({
    ok: true,
    token_hash: tokenHash,
    is_new: isNew,
    telegram_id: telegramId,
    display_name: [firstName, lastName].filter(Boolean).join(' ').trim() || username,
  });
});
