export const KOSKOS_ADMIN_PATH = '/koskos/mgr-8fq3wz';

export const CATEGORY_OPTIONS = [
  { value: 'cleanser', label: '클렌저' },
  { value: 'toner', label: '토너' },
  { value: 'essence_serum', label: '에센스/세럼' },
  { value: 'cream_moisturizer', label: '크림/수분크림' },
  { value: 'sun_care', label: '선케어' },
  { value: 'mask_pack', label: '마스크팩' },
  { value: 'mist_spray', label: '미스트' },
  { value: 'hair_care', label: '헤어/바디' },
  { value: 'other', label: '기타' },
] as const;

export type PendingMatchedItem = {
  raw?: string | null;
  matched?: boolean | null;
  name_en?: string | null;
  name_kr?: string | null;
  inci_key?: string | null;
};

export type PendingRow = {
  id: string;
  photo_url: string | null;
  ingredient_photo_url: string | null;
  photo_urls: string[] | null;
  extracted_name: string | null;
  extracted_brand: string | null;
  extracted_name_translation: string | null;
  extracted_ingredients_raw: string | null;
  extracted_category: string | null;
  status: string;
  created_at: string;
  matched_ingredients: PendingMatchedItem[] | null;
  unlisted_ingredient_proposals: unknown[] | null;
  ingredients_source: string | null;
  web_search_source_url: string | null;
  web_search_source_description: string | null;
  submission_type: string | null;
  description: string | null;
  target_product_id: string | null;
  brand_known: boolean;
};

export function categoryLabel(key: string | null | undefined): string {
  if (!key) return '미분류';
  return CATEGORY_OPTIONS.find((c) => c.value === key)?.label ?? key;
}

export function collectPhotos(row: PendingRow): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [row.photo_url, row.ingredient_photo_url, ...(row.photo_urls ?? [])]) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/** 승인 직후 알림용 products 조회 결과. cleanser_gentleness는 아직 없을 수 있는 컬럼. */
export type ApprovedProductInfo = {
  id: string;
  brand: string | null;
  name_en: string | null;
  category: string | null;
  is_bundle: boolean | null;
  cleanser_mechanism: string | null;
  cleanser_mechanism_reason: string | null;
  cleanser_gentleness?: string | null;
};

const CLEANSER_GENTLENESS_LABELS: Record<string, string> = {
  gentle: '순함',
  moderate: '보통',
  strong: '강함',
};

/**
 * 트리거(20260915120000)가 채운 세정방식 분류를 승인자용 한 줄로. 클렌저가 아니면 null.
 * 텔레그램 봇 `_cleanser_mechanism_line`과 같은 문구.
 * 예: '세정방식: 폼 (근거: sodium laureth sulfate #2)'
 */
export function cleanserMechanismLine(info: ApprovedProductInfo | null): string | null {
  if (!info || info.category !== 'cleanser') return null;
  const reason = (info.cleanser_mechanism_reason ?? '').trim();
  let line: string;
  if (info.cleanser_mechanism === 'surfactant') {
    if (reason.startsWith('detergent:')) {
      line = `세정방식: 폼 (근거: ${reason.slice('detergent:'.length).trim()})`;
    } else if (reason.startsWith('soap:')) {
      line = `세정방식: 폼·비누 (근거: ${reason.slice('soap:'.length).trim()})`;
    } else {
      line = `세정방식: 폼 (근거: ${reason || '기록 없음'})`;
    }
  } else if (info.cleanser_mechanism === 'non_surfactant') {
    line =
      !reason || reason.startsWith('no detergent')
        ? '세정방식: 비폼 (근거: 앞쪽 10번 안에 세정성분 없음)'
        : `세정방식: 비폼 (근거: 앞쪽 10번 안에 세정성분 없음 — ${reason})`;
  } else if (reason === 'no ingredients') {
    line = '세정방식: 미분류 (근거: 등록된 성분 없음)';
  } else if (info.is_bundle) {
    line = '세정방식: 미분류 (세트 상품은 분류 안 함)';
  } else {
    line = `세정방식: 미분류 (${reason || '분류값 없음'})`;
  }
  const g = info.cleanser_gentleness;
  if (g) line += ` · 순함 등급: ${CLEANSER_GENTLENESS_LABELS[g] ?? g}`;
  return line;
}

export function matchStats(row: PendingRow): { matched: number; unmatched: number; unlisted: number } {
  const items = row.matched_ingredients ?? [];
  const matched = items.filter((i) => i.matched === true).length;
  const unmatched = items.filter((i) => i.matched !== true).length;
  return {
    matched,
    unmatched,
    unlisted: row.unlisted_ingredient_proposals?.length ?? 0,
  };
}
