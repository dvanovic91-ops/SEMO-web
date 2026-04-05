import type { SupabaseClient } from '@supabase/supabase-js';

export type ResendSignupConfirmationResult =
  | { ok: true }
  | { ok: false; message: string; code?: 'rate_limited' };

function formatAuthErrorMessage(error: { message?: string; code?: string }): string {
  const msg = (error.message || 'Не удалось отправить письмо.').trim();
  const code = error.code?.trim();
  if (code && !msg.toLowerCase().includes(code.toLowerCase())) {
    return `${msg} (${code})`;
  }
  return msg;
}

/**
 * Supabase Auth 가입 확인 메일 재발송 (`auth.resend`).
 * 발송은 Supabase 서버가 담당 — Resend/SMTP는 대시보드 설정.
 * redirectPath 기본값은 `/auth/callback` — 토큰이 OAuth와 같이 처리됨 (`/profile`만 쓰면 해시가 무시되는 경우가 있음).
 * @see docs/SUPABASE_RESEND_SMTP.md
 */
export async function resendSignupConfirmationEmail(
  client: SupabaseClient,
  email: string,
  redirectPath = '/auth/callback',
): Promise<ResendSignupConfirmationResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, message: 'Не удалось определить email.' };
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const emailRedirectTo = origin ? `${origin.replace(/\/$/, '')}${redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`}` : undefined;

  const { error } = await client.auth.resend({
    type: 'signup',
    email: trimmed,
    ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
  });

  if (error) {
    console.warn('[resendSignupConfirmationEmail]', error);
    const m = (error.message || '').toLowerCase();
    if (m.includes('rate') || m.includes('too many') || m.includes('too_many')) {
      return {
        ok: false,
        code: 'rate_limited',
        message: 'Слишком часто. Подождите минуту и попробуйте снова.',
      };
    }
    if (m.includes('already been registered') || (m.includes('confirm') && m.includes('already'))) {
      return { ok: false, message: 'Email уже подтверждён. Обновите страницу.' };
    }
    return { ok: false, message: formatAuthErrorMessage(error) };
  }
  return { ok: true };
}
