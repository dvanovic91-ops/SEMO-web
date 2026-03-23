// Бот вызывает POST → RPC telegram_cabinet_preview → готовый текст для ЛК в Telegram.
// Данные совпадают с веб-ЛК (profiles.points, membership_coupons, shipping_addresses).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-secret',
};

function json(res: object, status = 200) {
  return new Response(JSON.stringify(res), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function fmtDateRu(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return iso;
  }
}

type CabinetPayload = {
  ok?: boolean;
  error?: string;
  display_name?: string;
  points?: number;
  coupons?: {
    id: string;
    amount: number;
    expires_at: string;
    used_at: string | null;
    tier?: string | null;
    quarter_label?: string | null;
  }[];
  shipping?: { fio?: string; address_line?: string; phone?: string } | null;
};

function formatCabinetRu(payload: CabinetPayload, siteBase: string): string {
  if (!payload.ok) {
    if (payload.error === 'telegram_not_linked') {
      return 'Аккаунт не привязан к сайту. Откройте профиль на сайте и привяжите Telegram.';
    }
    return 'Не удалось загрузить данные профиля.';
  }
  const lines: string[] = [];
  const name = (payload.display_name ?? '').trim();
  if (name) lines.push(`👤 ${name}`);
  lines.push('');
  lines.push(`⭐ Баллы: ${payload.points ?? 0}`);
  lines.push(`Подробнее: ${siteBase}/profile/points`);
  lines.push('');
  const coupons = payload.coupons ?? [];
  const now = Date.now();
  const active = coupons.filter((c) => !c.used_at && new Date(c.expires_at).getTime() >= now);
  lines.push(`🎟 Купоны: активных ${active.length}, всего записей ${coupons.length}`);
  if (coupons.length === 0) {
    lines.push('Пока нет купонов.');
  } else {
    for (const c of coupons.slice(0, 15)) {
      let line = ` • ${c.amount} ₽`;
      if (c.used_at) line += ` — использован ${fmtDateRu(c.used_at)}`;
      else if (new Date(c.expires_at).getTime() < now) line += ` — истёк ${fmtDateRu(c.expires_at)}`;
      else line += ` — до ${fmtDateRu(c.expires_at)}`;
      if (c.quarter_label) line += ` (${c.quarter_label})`;
      lines.push(line);
    }
    if (coupons.length > 15) lines.push(`… ещё ${coupons.length - 15}`);
  }
  lines.push(`Все купоны на сайте: ${siteBase}/profile/coupons`);
  lines.push('');
  const sh = payload.shipping;
  if (sh && ((sh.fio && sh.fio.length > 0) || (sh.address_line && sh.address_line.length > 0) || (sh.phone && sh.phone.length > 0))) {
    lines.push('📦 Доставка');
    if (sh.fio) lines.push(`Получатель: ${sh.fio}`);
    if (sh.address_line) lines.push(`Адрес: ${sh.address_line}`);
    if (sh.phone) lines.push(`Телефон: ${sh.phone}`);
  } else {
    lines.push('📦 Доставка: не указана в профиле на сайте.');
  }
  lines.push(`Изменить данные: ${siteBase}/profile/edit`);
  return lines.join('\n').trim();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const secret = Deno.env.get('TELEGRAM_CABINET_PREVIEW_SECRET');
  const got = req.headers.get('x-telegram-bot-secret') ?? '';
  if (!secret || got !== secret) return json({ error: 'unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const siteBase = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://semo-box.ru').replace(/\/$/, '');

  if (!supabaseUrl || !serviceRole) return json({ error: 'Supabase env missing' }, 500);

  let telegram_id: string | null = null;
  try {
    const body = await req.json();
    telegram_id = typeof body.telegram_id === 'string' ? body.telegram_id : null;
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!telegram_id?.trim()) return json({ error: 'telegram_id required' }, 400);

  const supabase = createClient(supabaseUrl, serviceRole);
  const { data: rpc, error } = await supabase.rpc('telegram_cabinet_preview', {
    p_telegram_id: telegram_id.trim(),
  });

  if (error) return json({ error: error.message }, 500);

  const payload = rpc as CabinetPayload;
  const message_ru = formatCabinetRu(payload, siteBase);

  return json({
    ...payload,
    message_ru,
    site_base: siteBase,
  });
});
