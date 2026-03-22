import { supabase } from './supabase';

/** 관리자 공지와 동일 제목·본문으로, 마케팅 동의한 고객에게만 유저 봇 메시지 발송 */
export async function sendMarketingTelegramBroadcast(title: string, body: string): Promise<{
  ok: boolean;
  sent?: number;
  total?: number;
  error?: string;
}> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabase || !url || !anon) return { ok: false, error: 'not_configured' };
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return { ok: false, error: 'no_session' };

  const res = await fetch(`${url.replace(/\/$/, '')}/functions/v1/telegram-broadcast-marketing`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: anon,
    },
    body: JSON.stringify({ title: title.trim(), body: body.trim() }),
  });
  const j = (await res.json()) as { ok?: boolean; sent?: number; total?: number; error?: string };
  if (!res.ok) return { ok: false, error: j.error ?? `http_${res.status}` };
  return { ok: true, sent: j.sent, total: j.total };
}
