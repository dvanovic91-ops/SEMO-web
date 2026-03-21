import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase Auth 가입 이메일 인증 재발송 — auth.users.email_confirmed_at 채우기 위한 링크.
 * (체크아웃·프로필에서 동일 사용)
 */
export async function resendSignupConfirmationEmail(
  client: SupabaseClient,
  email: string,
  redirectPath = '/checkout',
): Promise<{ ok: true } | { ok: false; message: string }> {
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
    return { ok: false, message: error.message || 'Не удалось отправить письмо.' };
  }
  return { ok: true };
}
