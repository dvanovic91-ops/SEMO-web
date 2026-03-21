import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 주문 전 이메일 소유 확인 — 체크아웃·프로필에서 동일 로직으로 매직링크 발송.
 * 리다이렉트는 항상 /checkout?ck=… (메일 링크 클릭 후 체크아웃에서 토큰 처리).
 */
export function buildCheckoutEmailVerifyRedirectUrl(
  origin: string,
  ckToken: string,
  options?: { testOrder?: boolean },
): string {
  const redirect = new URL(`${origin.replace(/\/$/, '')}/checkout`);
  if (options?.testOrder) redirect.searchParams.set('test', '1');
  redirect.searchParams.set('ck', ckToken);
  return redirect.toString();
}

export type SendOrderEmailVerifyResult =
  | { ok: true }
  | { ok: false; code: 'no_email' | 'db_not_configured' | 'unknown'; message: string };

export async function sendOrderEmailVerificationLink(
  client: SupabaseClient,
  params: { userId: string; email: string; origin: string; testOrder?: boolean },
): Promise<SendOrderEmailVerifyResult> {
  const { userId, email, origin, testOrder } = params;
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, code: 'no_email', message: 'Не удалось определить email.' };
  }

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const { error: upErr } = await client
    .from('profiles')
    .update({
      checkout_email_verify_token: token,
      checkout_email_verify_expires_at: expires,
    })
    .eq('id', userId);

  if (upErr) {
    const m = (upErr.message || '').toLowerCase();
    if (m.includes('checkout_email_verify') || m.includes('column') || m.includes('schema')) {
      return {
        ok: false,
        code: 'db_not_configured',
        message:
          'Проверка email для заказа не настроена в базе. Выполните SQL из docs/SUPABASE_CHECKOUT_EMAIL_VERIFICATION.sql.',
      };
    }
    return { ok: false, code: 'unknown', message: upErr.message || 'Не удалось подготовить ссылку.' };
  }

  const emailRedirectTo = buildCheckoutEmailVerifyRedirectUrl(origin, token, { testOrder });

  const { error: otpErr } = await client.auth.signInWithOtp({
    email: trimmed,
    options: {
      shouldCreateUser: false,
      emailRedirectTo,
    },
  });

  if (otpErr) {
    return { ok: false, code: 'unknown', message: otpErr.message || 'Не удалось отправить письмо.' };
  }
  return { ok: true };
}
