// ============================================================
//  Telegram Auth — Widget Login + Mini App Auto-Login
//  모든 응답은 HTTP 200 + JSON body (ok: true/false)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(res: object) {
  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(error: string, extra?: Record<string, unknown>) {
  return json({ ok: false, error, ...extra });
}

// ── Crypto helpers ──

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
): Promise<{ ok: boolean; user?: Record<string, unknown>; debug?: string }> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, debug: 'no_hash_param' };
  const checkArr: string[] = [];
  params.forEach((v, k) => {
    if (k !== 'hash') checkArr.push(`${k}=${v}`);
  });
  checkArr.sort();
  const checkString = checkArr.join('\n');
  const secretKey = await hmacSha256(new TextEncoder().encode('WebAppData'), botToken);
  const computed = bufToHex(await hmacSha256(secretKey, checkString));
  if (computed !== hash) {
    return { ok: false, debug: `hash_mismatch|expected:${hash.substring(0,16)}|got:${computed.substring(0,16)}|tokenLen:${botToken.length}` };
  }
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

  try {
    const botToken = Deno.env.get('TELEGRAM_USER_BOT_TOKEN') ?? Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
    if (!botToken) return fail('TELEGRAM_BOT_TOKEN_not_configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) return fail('supabase_env_missing');

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
      else return fail('bad_mode');
    } catch {
      return fail('invalid_json');
    }

    // ── 1. Verify hash ──
    let telegramId: string | null = null;
    let firstName = '';
    let lastName = '';
    let username = '';

    if (mode === 'widget' && widgetData) {
      const valid = await verifyWidgetHash(botToken, widgetData);
      if (!valid) return fail('widget_invalid_hash');
      const authDate = parseInt(widgetData.auth_date || '0', 10);
      if (Math.abs(Date.now() / 1000 - authDate) > 600) {
        return fail('widget_auth_date_expired', { authDate, serverTime: Math.floor(Date.now() / 1000) });
      }
      telegramId = widgetData.id;
      firstName = widgetData.first_name || '';
      lastName = widgetData.last_name || '';
      username = widgetData.username || '';
    }

    if (mode === 'miniapp' && miniAppInitData) {
      const result = await verifyMiniAppHash(botToken, miniAppInitData);
      if (!result.ok) return fail('miniapp_invalid_hash', { debug: result.debug });
      const params = new URLSearchParams(miniAppInitData);
      const authDate = parseInt(params.get('auth_date') || '0', 10);
      const serverTime = Math.floor(Date.now() / 1000);
      if (Math.abs(serverTime - authDate) > 600) {
        return fail('miniapp_auth_date_expired', { authDate, serverTime, diff: serverTime - authDate });
      }
      const user = result.user as Record<string, unknown> | undefined;
      telegramId = user?.id != null ? String(user.id) : null;
      firstName = (user?.first_name as string) || '';
      lastName = (user?.last_name as string) || '';
      username = (user?.username as string) || '';
    }

    if (!telegramId) return fail('telegram_id_missing');

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
      userId = profile.id;
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      userEmail = authUser?.user?.email || profile.email || `tg_${telegramId}@tg.semo-box.local`;
    } else {
      isNew = true;
      userEmail = `tg_${telegramId}@tg.semo-box.local`;
      const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || username || `TG_${telegramId}`;
      const randomPwd = bufToHex(crypto.getRandomValues(new Uint8Array(32)));

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: userEmail,
        password: randomPwd,
        email_confirm: true,
        user_metadata: { nickname: displayName, telegram_id: telegramId },
      });

      if (createErr || !newUser?.user?.id) {
        const { data: retryProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('telegram_id', telegramId)
          .maybeSingle();
        if (retryProfile?.id) {
          userId = retryProfile.id;
          isNew = false;
        } else {
          return fail('user_creation_failed', { details: createErr?.message });
        }
      } else {
        userId = newUser.user.id;
      }

      await supabase.from('profiles').update({
        telegram_id: telegramId,
        name: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
      }).eq('id', userId!);
    }

    // ── 4. Generate magiclink ──
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (linkErr || !linkData) {
      return fail('magiclink_failed', { details: linkErr?.message });
    }

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) return fail('no_token_hash');

    return json({
      ok: true,
      token_hash: tokenHash,
      is_new: isNew,
      telegram_id: telegramId,
      display_name: [firstName, lastName].filter(Boolean).join(' ').trim() || username,
    });
  } catch (e) {
    return fail('unexpected_error', { message: (e as Error).message });
  }
});
