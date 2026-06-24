import { resolveInciKey, lookupIngredientTrilingual } from './inciDictionary';
import {
  lookupIngredientLibraryRow,
  type IngredientLibraryRow,
} from './ingredientLibrary';
import { formatInciNameForDisplay } from './skuIngredientsParse';

function hasHangulText(s: string): boolean {
  return /[가-힣]/.test(s);
}

function hasCyrillicText(s: string): boolean {
  return /[а-яА-ЯёЁ]/.test(s);
}

/**
 * 스토어 성분명 (.com / .ru 공통: INCI 라틴 표기).
 * 제품명·브랜드와 달리 성분 INCI는 국제 표준이라 라틴(영문) 유지.
 * .ru에서의 「러시아어」는 효과/설명(blurb) 쪽에서 처리 (storefrontLibRole, heroBlurb).
 */
export function getStorefrontInciDisplayName(
  rawName: string,
  language: 'en' | 'ru',
  libMap?: Map<string, IngredientLibraryRow>,
): string {
  if (language === 'ru' && hasCyrillicText(rawName)) {
    return formatInciNameForDisplay(rawName.trim());
  }

  const enKey = resolveInciKey(rawName);
  if (!hasHangulText(enKey)) {
    return formatInciNameForDisplay(enKey);
  }

  if (libMap) {
    const libRow = lookupIngredientLibraryRow(libMap, rawName, enKey);
    const fromLib = (libRow?.name_en ?? libRow?.inci_key ?? '').trim();
    if (fromLib && !hasHangulText(fromLib)) {
      return formatInciNameForDisplay(fromLib);
    }
  }

  const dict = lookupIngredientTrilingual(enKey);
  if (dict?.en && !hasHangulText(dict.en)) {
    return formatInciNameForDisplay(enKey);
  }

  return formatInciNameForDisplay(rawName);
}

/** .ru 스토어 — 성분 효과/역할 한 줄 (라이브러리 → 사전 → benefit_tags) */
export function getStorefrontInciRoleRu(
  rawName: string,
  nameLower: string,
  libMap: Map<string, IngredientLibraryRow> | undefined,
  benefitTags: string[] | undefined,
): string {
  const enKey = resolveInciKey(rawName);
  const libRow = libMap
    ? lookupIngredientLibraryRow(libMap, rawName, nameLower || enKey)
    : undefined;
  const fromLib = libRow?.description_ru?.trim();
  if (fromLib) return fromLib;
  const dict = lookupIngredientTrilingual(enKey);
  if (dict?.ru?.trim()) return dict.ru.trim();
  const tags = benefitTags?.filter(Boolean) ?? [];
  return tags.length > 0 ? tags.join(' · ') : '';
}

/** .com 스토어 — 성분 효과/역할 한 줄 (영어) */
export function getStorefrontInciRoleEn(
  rawName: string,
  nameLower: string,
  libMap: Map<string, IngredientLibraryRow> | undefined,
  benefitTags: string[] | undefined,
): string {
  const enKey = resolveInciKey(rawName);
  const libRow = libMap
    ? lookupIngredientLibraryRow(libMap, rawName, nameLower || enKey)
    : undefined;
  const fromLib = libRow?.description_en?.trim() || libRow?.description_ko?.trim();
  if (fromLib) return fromLib;
  const dict = lookupIngredientTrilingual(enKey);
  if (dict?.en?.trim()) return dict.en.trim();
  const tags = benefitTags?.filter(Boolean) ?? [];
  return tags.length > 0 ? tags.join(' · ') : '';
}
