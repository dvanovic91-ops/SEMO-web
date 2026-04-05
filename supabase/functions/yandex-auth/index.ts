// ============================================================
//  Yandex OAuth — Authorization Code 교환 → Supabase 세션 생성
//  1) 프론트에서 Yandex OAuth code 수신
//  2) code → access_token 교환
//  3) Yandex 유저 정보 조회
//  4) Supabase 유저 찾기/생성 → magiclink token_hash 반환
// ============================================================

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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(res: object, req: Request) {
  return new Response(JSON.stringify(res), {
    status: 200,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function fail(error: string, req: Request, extra?: Record<string, unknown>) {
  return json({ ok: false, error, ...extra }, req);
}

function rateLimitResp(req: Request) {
  return new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
    status: 429,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// ── Rate limiter (IP당 분당 10회) ──
const rlStore = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, maxPerMinute = 10): boolean {
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

// ── redirect_uri 허용 목록 ──
const ALLOWED_REDIRECT_URIS = new Set([
  'https://semo-box.com/auth/yandex/callback',
  'http://localhost:5173/auth/yandex/callback',
  'http://localhost:3001/auth/yandex/callback',
]);

function bufToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * profiles.email_verified_at — 트리거 protect_profile_email_verified_at_write 가
 * 일반 UPDATE 를 막으므로 RPC(oauth_sync_email_verified_for_user)로만 갱신.
 */
async function ensureProfileEmailVerifiedForYandex(
  supabase: ReturnType<typeof createClient>,
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) return;
  const { error } = await supabase.rpc('oauth_sync_email_verified_for_user', { p_user_id: userId });
  if (error) {
    console.error('oauth_sync_email_verified_for_user', error.message);
  }
}

// ── Main handler ──

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) });

  const ip = getClientIp(req);
  if (isRateLimited(ip, 10)) return rateLimitResp(req);

  try {
    const clientId = Deno.env.get('YANDEX_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('YANDEX_CLIENT_SECRET') ?? '';
    if (!clientId || !clientSecret) return fail('yandex_credentials_not_configured', req);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) return fail('supabase_env_missing', req);

    const supabase = createClient(supabaseUrl, serviceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Parse request ──
    let code: string;
    let redirectUri: string;
    try {
      const body = await req.json();
      code = body.code;
      redirectUri = body.redirect_uri;
      if (!code) return fail('missing_code', req);
      if (!redirectUri) return fail('missing_redirect_uri', req);
    } catch {
      return fail('invalid_json', req);
    }

    // ── redirect_uri 허용 목록 검증 ──
    if (!ALLOWED_REDIRECT_URIS.has(redirectUri)) {
      return fail('invalid_redirect_uri', req);
    }

    // ── 2. Exchange code for access_token ──
    const tokenResp = await fetch('https://oauth.yandex.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenResp.json();
    if (!tokenData.access_token) {
      return fail('token_exchange_failed', req, {
        yandex_error: tokenData.error,
        yandex_description: tokenData.error_description,
      });
    }

    // ── 3. Get Yandex user info ──
    const userResp = await fetch('https://login.yandex.ru/info?format=json', {
      headers: { Authorization: `OAuth ${tokenData.access_token}` },
    });
    const yandexUser = await userResp.json();

    if (!yandexUser.id) {
      return fail('yandex_user_info_failed', req);
    }

    const yandexId = String(yandexUser.id);
    const yandexEmail = yandexUser.default_email || `${yandexUser.login}@yandex.ru`;
    const displayName = yandexUser.display_name || yandexUser.real_name || yandexUser.login || '';
    const firstName = yandexUser.first_name || '';
    const lastName = yandexUser.last_name || '';

    // ── 4. Find or create Supabase user ──
    let userId: string | undefined;
    let userEmail: string;
    let isNew = false;

    const { data: userByEmail } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', yandexEmail)
      .maybeSingle();

    if (userByEmail?.id) {
      userId = userByEmail.id;
      userEmail = yandexEmail;
    } else {
      isNew = true;
      userEmail = yandexEmail;
      const randomPwd = bufToHex(crypto.getRandomValues(new Uint8Array(32)));

      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email: userEmail,
        password: randomPwd,
        email_confirm: true,
        app_metadata: {
          provider: 'yandex',
          providers: ['yandex'],
        },
        user_metadata: {
          nickname: displayName || [firstName, lastName].filter(Boolean).join(' ').trim(),
          yandex_id: yandexId,
          full_name: [firstName, lastName].filter(Boolean).join(' ').trim(),
        },
      });

      if (createErr) {
        const { data: linkAttempt, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: userEmail,
        });
        if (linkErr || !linkAttempt) {
          return fail('user_creation_failed', req, { details: createErr.message });
        }
        const tokenHash = linkAttempt.properties?.hashed_token;
        if (!tokenHash) return fail('no_token_hash', req);

        const existingId = linkAttempt.user?.id;
        const { data: authUser } = await supabase.auth.admin.getUserById(existingId ?? '');
        if (authUser?.user?.id) {
          await supabase.from('profiles').update({
            name: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
          }).eq('id', authUser.user.id).is('name', null);
        }
        await ensureProfileEmailVerifiedForYandex(supabase, existingId);

        return json({
          ok: true,
          token_hash: tokenHash,
          is_new: false,
          email: userEmail,
          display_name: displayName,
        }, req);
      }

      if (newUser?.user?.id) {
        userId = newUser.user.id;
        await supabase.from('profiles').update({
          email: yandexEmail,
          name: [firstName, lastName].filter(Boolean).join(' ').trim() || null,
        }).eq('id', userId);
        await ensureProfileEmailVerifiedForYandex(supabase, userId);
      }
    }

    // ── 5. Generate magiclink ──
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (linkErr || !linkData) {
      return fail('magiclink_failed', req, { details: linkErr?.message });
    }

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) return fail('no_token_hash', req);

    const sessionUserId = linkData.user?.id ?? userId;
    await ensureProfileEmailVerifiedForYandex(supabase, sessionUserId);

    return json({
      ok: true,
      token_hash: tokenHash,
      is_new: isNew,
      email: userEmail,
      display_name: displayName,
    }, req);
  } catch (e) {
    return fail('unexpected_error', req, { message: (e as Error).message });
  }
});
