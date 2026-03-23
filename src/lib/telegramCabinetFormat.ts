/**
 * Текст «Личный кабинет» для Telegram по ответу RPC `telegram_cabinet_preview`.
 * Дублируется в `supabase/functions/telegram-cabinet-preview/index.ts` — при правках синхронизировать.
 */

export type TelegramCabinetCouponRow = {
  id: string;
  amount: number;
  expires_at: string;
  used_at: string | null;
  tier?: string | null;
  quarter_label?: string | null;
};

export type TelegramCabinetRpcPayload = {
  ok?: boolean;
  error?: string;
  display_name?: string;
  points?: number;
  coupons?: TelegramCabinetCouponRow[];
  shipping?: { fio?: string; address_line?: string; phone?: string } | null;
};

function fmtDateRu(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return iso;
  }
}

export function buildSiteProfileUrl(siteBase: string): string {
  return `${siteBase.replace(/\/$/, '')}/profile/edit`;
}

/** Готовый текст для sendMessage (plain). */
export function formatTelegramCabinetMessageRu(payload: TelegramCabinetRpcPayload, siteBase: string): string {
  const base = siteBase.replace(/\/$/, '');
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
  lines.push(`Подробнее: ${base}/profile/points`);
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
  lines.push(`Все купоны на сайте: ${base}/profile/coupons`);
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
  lines.push(`Изменить данные: ${base}/profile/edit`);
  return lines.join('\n').trim();
}
