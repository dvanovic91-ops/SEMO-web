/** box_builder_tag_ru/en 표시용 — DB에 한글이 섞인 레거시 태그 정리 + 선크림 INCI SPF 보정 */

const HANGUL_RE = /[가-힣]+/g;

const KO_TO_RU: Record<string, string> = {
  'BHA 모공케어': 'BHA уход за порами',
  'BHA 각질케어': 'BHA Эксфолиант',
  'LHA 모공케어': 'LHA поры',
  모공케어: 'уход за порами',
  각질케어: 'Эксфолиант',
};

const MINERAL_UV_RE = /\b(zinc oxide|titanium dioxide|ci 77891)\b/i;
const ORGANIC_UV_RE =
  /\b(octinoxate|ethylhexyl methoxycinnamate|homosalate|octocrylene|avobenzone|butyl methoxydibenzoylmethane|octisalate|ethylhexyl salicylate|bis-ethylhexyloxyphenol|diethylamino hydroxybenzoyl|tinosorb|uvinul|methylene bis-benzotriazolyl|ethylhexyl triazone|phenylbenzimidazole)\b/i;

function replaceTagPart1(tag: string, newPart1: string): string {
  const t = (tag ?? '').trim();
  if (!t) return newPart1;
  const dot = t.indexOf('·');
  if (dot >= 0) return `${newPart1} · ${t.slice(dot + 1).trim()}`;
  return newPart1;
}

export function sunscreenFilterPart1FromInci(ingredientsRaw: string | null | undefined): { ru: string; en: string } | null {
  const blob = (ingredientsRaw ?? '').trim().toLowerCase();
  if (!blob) return null;
  const mineral = MINERAL_UV_RE.test(blob);
  const organic = ORGANIC_UV_RE.test(blob);
  if (mineral && organic) return { ru: 'Смешанный SPF', en: 'Hybrid SPF' };
  if (mineral) return { ru: 'Минеральный SPF', en: 'Mineral SPF' };
  if (organic) return { ru: 'Химический SPF', en: 'Chemical SPF' };
  return null;
}

export function applySunscreenTagFromInci(
  tagRu: string,
  tagEn: string,
  ingredientsRaw: string | null | undefined,
): { tagRu: string; tagEn: string } {
  const spf = sunscreenFilterPart1FromInci(ingredientsRaw);
  if (!spf) return { tagRu, tagEn };
  return {
    tagRu: replaceTagPart1(tagRu, spf.ru),
    tagEn: replaceTagPart1(tagEn, spf.en),
  };
}

export function sanitizeBoxBuilderTagForDisplay(tag: string | null | undefined): string {
  let t = (tag ?? '').trim();
  if (!t) return t;
  for (const [ko, ru] of Object.entries(KO_TO_RU).sort((a, b) => b[0].length - a[0].length)) {
    t = t.replaceAll(ko, ru);
  }
  t = t.replace(HANGUL_RE, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/\s*·\s*/g, ' · ').replace(/(^·\s*|\s·$)/g, '').trim();
  return t;
}

export function splitBoxBuilderTagParts(tag: string | null | undefined): string[] {
  const t = sanitizeBoxBuilderTagForDisplay(tag);
  if (!t) return [];
  return t.split(/\s*·\s*/).map((p) => p.trim()).filter(Boolean);
}
