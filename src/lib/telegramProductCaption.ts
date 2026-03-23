/**
 * Тексты карточки товара в Telegram (витрина бота).
 * Не включаем остаток на складе — для покупателя это внутренняя информация.
 *
 * «шт» (штука) в паре с числом или с 📦 часто означает количество на складе — такие строки убираем из подписи.
 */

/** Удалить из описания строки, похожие на остаток / «N шт» / служебные пометки */
export function sanitizeDescriptionForTelegram(description: string | null | undefined): string {
  if (!description?.trim()) return '';
  return description
    .split(/\r?\n/)
    .filter((line) => !shouldHideProductLine(line))
    .join('\n')
    .trim();
}

function shouldHideProductLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  const lower = t.toLowerCase();

  // «12 шт», «5 шт.» — типичная разметка количества
  if (/\d+\s*шт\.?/i.test(t)) return true;

  // Строка с коробкой и шт (как у вас в боте)
  if (/📦/.test(t) && /шт/i.test(t)) return true;

  if (/\bостат(ок|ка|ки)\b/i.test(lower)) return true;
  if (/\bналич(ие|ия)\b/i.test(lower)) return true;
  if (/\bсклад\b/i.test(lower)) return true;
  if (/\bstock\b/i.test(lower)) return true;

  return false;
}

export type TelegramProductCaptionInput = {
  name: string;
  description?: string | null;
  detailDescription?: string | null;
  /** Рубли, не копейки */
  prpPrice: number | null | undefined;
  rrpPrice?: number | null | undefined;
  /** 1-based номер в списке */
  indexOneBased: number;
  total: number;
};

/** Подпись к одному фото (без HTML, plain text для sendPhoto caption) */
export function buildTelegramProductCaption(input: TelegramProductCaptionInput): string {
  const title = `${input.indexOneBased}/${input.total} — ${input.name.trim()}`;
  const body = sanitizeDescriptionForTelegram(
    [input.description, input.detailDescription].filter(Boolean).join('\n\n'),
  );
  const priceLine = formatPriceBlock(input.prpPrice, input.rrpPrice);
  const parts = [title, body, priceLine].filter((p) => p.length > 0);
  let text = parts.join('\n\n');
  // Telegram caption limit 1024
  if (text.length > 1000) {
    text = `${text.slice(0, 997)}…`;
  }
  return text;
}

function formatPriceBlock(prp: number | null | undefined, rrp: number | null | undefined): string {
  const pr = prp != null && !Number.isNaN(prp) ? Math.round(prp) : null;
  const rr = rrp != null && !Number.isNaN(rrp) ? Math.round(rrp) : null;
  if (pr != null && rr != null && rr > pr) {
    return `Цена: ${pr.toLocaleString('ru-RU')} ₽\nБез скидки: ${rr.toLocaleString('ru-RU')} ₽`;
  }
  if (pr != null) return `Цена: ${pr.toLocaleString('ru-RU')} ₽`;
  if (rr != null) return `Цена: ${rr.toLocaleString('ru-RU')} ₽`;
  return '';
}
