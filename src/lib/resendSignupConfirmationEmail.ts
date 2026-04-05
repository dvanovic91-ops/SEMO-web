import type { SupabaseClient } from '@supabase/supabase-js';

/** Supabase 대시보드에서 Confirm email 켠 상태에서만 동작. 가입 확인 메일 재발송 */
export async function resendSignupConfirmationEmail(
  client: SupabaseClient,
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const origin = typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';
  const { error } = await client.auth.resend({
    type: 'signup',
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}
