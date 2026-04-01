// ============================================================
//  Yandex OAuth — Authorization Code 교환 → Supabase 세션 생성
//  1) 프론트에서 Yandex OAuth code 수신
//  2) code → access_token 교환
//  3) Yandex 유저 정보 조회
//  4) Supabase 유저 찾기/생성 → magiclink token_hash 반환
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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  try {
    const clientId = Deno.env.get('YANDEX_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('YANDEX_CLIENT_SECRET') ?? '';
    if (!clientId || !clientSecret) return fail('yandex_credentials_not_configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRole) return fail('supabase_env_missing');

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
      if (!code) return fail('missing_code');
      if (!redirectUri) return fail('missing_redirect_uri');
    } catch {
      return fail('invalid_json');
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
      return fail('token_exchange_failed', {
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
      return fail('yandex_user_info_failed');
    }

    const yandexId = String(yandexUser.id);
    const yandexEmail = yandexUser.default_email || `${yandexUser.login}@yandex.ru`;
    const displayName = yandexUser.display_name || yandexUser.real_name || yandexUser.login || '';
    const firstName = yandexUser.first_name || '';
    const lastName = yandexUser.last_name || '';

    // ── 4. Find or create Supabase user ──
    // 먼저 이메일로 기존 유저 검색
    let userId: string | undefined;
    let userEmail: string;
    let isNew = false;

    const { data: userByEmail } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', yandexEmail)
      .maybeSingle();

    if (userByEmail?.id) {
      // 이메일로 찾음
      userId = userByEmail.id;
      userEmail = yandexEmail;
    } else {
      // 새 유저 생성
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
        // 이미 auth.users에 같은 이메일이 있을 수 있음 (Google로 가입 등)
        // getUserByEmail은 없으므로 listUsers 필터링
        // 대안: generateLink로 바로 시도
        const { data: linkAttempt, error: linkErr } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: userEmail,
        });
        if (linkErr || !linkAttempt) {
          return fail('user_creation_failed', { details: createErr.message });
        }
        // 기존 유저의 magiclink
        const tokenHash = linkAttempt.properties?.hashed_token;
        if (!tokenHash) return fail('no_token_hash');

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
        });
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
      return fail('magiclink_failed', { details: linkErr?.message });
    }

    const tokenHash = linkData.properties?.hashed_token;
    if (!tokenHash) return fail('no_token_hash');

    const sessionUserId = linkData.user?.id ?? userId;
    await ensureProfileEmailVerifiedForYandex(supabase, sessionUserId);

    return json({
      ok: true,
      token_hash: tokenHash,
      is_new: isNew,
      email: userEmail,
      display_name: displayName,
    });
  } catch (e) {
    return fail('unexpected_error', { message: (e as Error).message });
  }
});
