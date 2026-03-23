// После успешного RPC link_telegram бот вызывает POST → sendMessage с приветствием.
// Текст синхронизировать с src/lib/telegramLinkNoticeRu.ts → TELEGRAM_LINK_SUCCESS_GREETING_RU

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
};

function json(res: object, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const GREETING_RU =
  'Привет! Ваш аккаунт успешно привязан. 🔐\nДля вашей безопасности используйте этот чат только на личном телефоне.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const secret = Deno.env.get('TELEGRAM_LINK_WELCOME_SECRET');
  const got = req.headers.get('x-telegram-bot-secret') ?? '';
  if (!secret || got !== secret) return json({ error: 'unauthorized' }, 401);

  const token = Deno.env.get('TELEGRAM_USER_BOT_TOKEN');
  if (!token) return json({ error: 'TELEGRAM_USER_BOT_TOKEN not set' }, 500);

  let telegram_id: string | null = null;
  try {
    const body = await req.json();
    telegram_id = typeof body.telegram_id === 'string' ? body.telegram_id : null;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!telegram_id?.trim()) return json({ error: 'telegram_id required' }, 400);

  const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: telegram_id.trim(),
      text: GREETING_RU,
    }),
  });
  const tgData = await tgRes.json();
  if (!tgRes.ok || !tgData.ok) return json({ error: 'Telegram send failed', details: tgData }, 502);
  return json({ ok: true, sent: true });
});
