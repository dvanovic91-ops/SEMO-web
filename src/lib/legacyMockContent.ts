/**
 * 레거시 내부 목업 문자열 — 과거 개발/테스트 시 DB·시드에만 들어가던 고유 패턴.
 * 운영에서 실제 브랜드·카피와 겹치지 않게 유지할 것.
 *
 * 사용처: 상품/슬롯 텍스트 표시 전 정리, 구성품 이름 필터, skuMarketingDescriptions.
 * 봇: semo_bot/.../supabase_helper.py 의 _CATALOG_JUNK_* / 니후야 처리와 의미 동기화.
 */

/** products·slots description 등에만 쓰이던 한국어 한 줄 목업 */
export const LEGACY_PRODUCT_FIELD_EXACT_PHRASES = [
  '돈좀 많이 벌게해주세요',
  '돈 좀 많이 벌게 해주세요',
] as const;

/** 구성품 표시명에 남은 영문 목업 오타/브랜드 자리 */
export const LEGACY_COMPOSITION_TYPOS = ['perfect serum foring'] as const;

/** 한 줄 앞부분 니후야 / Nihuya 접두어 (DB __claim__, display_name 등 공통) */
export function stripLegacyNihuyaLinePrefix(text: string): string {
  let t = (text ?? '').trim();
  t = t.replace(/^니후야[^:]*:\s*/u, '');
  t = t.replace(/^Nihuya[^:]*:\s*/iu, '');
  return t.trim();
}

export function lineIsStandaloneHttpUrl(line: string): boolean {
  const t = line.trim();
  return /^https?:\/\/\S+$/i.test(t);
}

/**
 * products.description / detail_description / 슬롯 description 등 멀티라인 필드용.
 * 정확히 알려진 목업 문구가 들어간 줄·URL 단독 줄만 제거.
 */
export function stripLegacyProductMultilineField(raw: string | null | undefined): string | null {
  if (raw == null || !String(raw).trim()) return null;
  const lines = String(raw)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (LEGACY_PRODUCT_FIELD_EXACT_PHRASES.some((p) => t.includes(p))) return false;
      if (lineIsStandaloneHttpUrl(t)) return false;
      return true;
    });
  const out = lines.join('\n').trim();
  return out || null;
}

/**
 * 구성품 카드 필터용(피부테스트 등). 맨 앞 레거시 목업 접두만 — 본문에 `perfect serum foring`이
 * 들어간 정상 영문명까지 숨기지 않도록 오타는 여기서 제외(카탈로그용 함수만 전체 일치 처리).
 */
export function isLegacyMockCompositionDisplayName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const s = String(name).trim();
  if (s.startsWith('니후야')) return true;
  if (/^nihuya\b/i.test(s)) return true;
  return false;
}

/** 샵·홈·박스 히스토리 카드 — 목업 상품명 숨김(접두 + 알려진 오타는 제목 전체가 일치할 때만) */
export function isLegacyMockCatalogProductName(name: string | null | undefined): boolean {
  if (name == null || !String(name).trim()) return false;
  const s = String(name).trim();
  const low = s.toLowerCase();
  if (s.startsWith('니후야')) return true;
  if (/^nihuya\b/i.test(s)) return true;
  for (const typo of LEGACY_COMPOSITION_TYPOS) {
    if (low === typo.toLowerCase()) return true;
  }
  return false;
}

/** @deprecated stripLegacyProductMultilineField 사용 권장 */
export const stripInternalMockCopy = stripLegacyProductMultilineField;

/** @deprecated isLegacyMockCompositionDisplayName 사용 권장 */
export const isLegacyMockCompositionName = isLegacyMockCompositionDisplayName;
