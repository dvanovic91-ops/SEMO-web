import productTypeHeroHints from '../../config/productTypeHeroHints.json';

export type AxisIngredientInput = {
  name: string;
  name_lower?: string;
  position?: number;
  benefit_tags?: string[];
  avoid_skin_types?: string[];
  axis_scores?: Record<string, number> | null;
  is_sensitizing?: boolean;
};

export type AxisIngredientDetail = {
  name: string;
  position: number;
  axisLabel: string;
  contribution: 'benefit' | 'penalty';
  reason: string;
  weight: number;
};

export type AxisResult = {
  pair: [string, string];
  scores: [number, number];
  pcts: [number, number];
  details: AxisIngredientDetail[];
  hasContributions: boolean;
};

const PRODUCT_TYPE_AXIS_DISPLAY: Record<
  string,
  { endpoints: readonly ('D' | 'O' | 'S' | 'R' | 'P' | 'N' | 'W' | 'T')[] }
> = {
  클렌저: { endpoints: ['S', 'R', 'D', 'O'] },
  토너: { endpoints: ['D', 'O', 'S', 'R'] },
  선크림: { endpoints: ['P', 'N', 'S', 'R'] },
};

const DEFAULT_PRODUCT_TYPE_AXIS_DISPLAY = {
  endpoints: ['D', 'O', 'S', 'R', 'P', 'N', 'W', 'T'] as const,
};

export function getProductTypeSummaryKo(productType: string | null | undefined): string {
  const key = (productType ?? '').trim();
  const row = (productTypeHeroHints as Record<string, { summaryKo?: string }>)[key];
  const fromJson = row?.summaryKo?.trim();
  if (fromJson) return fromJson;
  const fallback = (productTypeHeroHints as Record<string, { summaryKo?: string }>)['기타']?.summaryKo?.trim();
  return fallback ?? '유형 미지정·기타: 건/지·민감/저항·색소·주름·탄력 네 쌍을 모두 펼쳐 표시합니다.';
}

export function getAxisDisplayForProductType(productType: string | null | undefined): {
  endpoints: readonly ('D' | 'O' | 'S' | 'R' | 'P' | 'N' | 'W' | 'T')[];
} {
  const key = (productType ?? '').trim();
  if (key && PRODUCT_TYPE_AXIS_DISPLAY[key]) return PRODUCT_TYPE_AXIS_DISPLAY[key];
  return DEFAULT_PRODUCT_TYPE_AXIS_DISPLAY;
}

export function axisResultForEndpoint(axisResults: AxisResult[], letter: string): AxisResult | undefined {
  return axisResults.find((x) => x.pair[0] === letter || x.pair[1] === letter);
}

export function pctForEndpoint(axisResults: AxisResult[], letter: string): number | null {
  const ar = axisResultForEndpoint(axisResults, letter);
  if (!ar) return null;
  return ar.pair[0] === letter ? ar.pcts[0] : ar.pcts[1];
}

export function computeAxisScores(ingredients: AxisIngredientInput[]): AxisResult[] {
  if (ingredients.length === 0) return [];
  const total = ingredients.length;
  const posW = (pos: number) => Math.max(0.1, 10 / (pos > 0 ? pos : 1));

  const AXIS_BENEFIT_TAGS: Record<string, string[]> = {
    D: ['hydrating', 'barrier', 'soothing'],
    O: ['oil_control', 'exfoliating', 'acne'],
    S: ['soothing', 'barrier'],
    P: ['brightening', 'antioxidant', 'exfoliating', 'uv_protection'],
    W: ['anti_aging', 'firming', 'antioxidant'],
  };

  const computeOneAxis = (
    axis: string,
    details: AxisIngredientDetail[],
    rPenaltyRef?: { sum: number },
  ): { benefit: number; penalty: number; totalW: number } => {
    const needTags = AXIS_BENEFIT_TAGS[axis] ?? [];
    let benefitSum = 0;
    let penaltySum = 0;
    let totalW = 0;

    for (const ing of ingredients) {
      const pw = posW(ing.position ?? total);
      totalW += pw;
      const tags = ing.benefit_tags ?? [];
      const avoidCol = ing.avoid_skin_types ?? [];

      const axisValRaw = ing.axis_scores?.[axis];
      const axisVal = typeof axisValRaw === 'number' && !Number.isNaN(axisValRaw) ? axisValRaw : null;
      const matchingTags = tags.filter((t) => needTags.includes(t));
      if (axisVal !== null) {
        benefitSum += pw * (axisVal / 10);
        details.push({
          name: ing.name,
          position: ing.position ?? total,
          axisLabel: axis,
          contribution: 'benefit',
          reason: `5축 ${axis}=${axisVal.toFixed(0)}`,
          weight: pw * (axisVal / 10),
        });
      } else if (matchingTags.length > 0) {
        benefitSum += pw * 0.6;
        details.push({
          name: ing.name,
          position: ing.position ?? total,
          axisLabel: axis,
          contribution: 'benefit',
          reason: matchingTags.join(' · ') + ' 태그 (기본 0.6)',
          weight: pw * 0.6,
        });
      }

      if (tags.includes(`avoid:${axis}`)) {
        penaltySum += pw * 2;
        details.push({
          name: ing.name,
          position: ing.position ?? total,
          axisLabel: axis,
          contribution: 'penalty',
          reason: `avoid:${axis} 태그 — 해당 피부타입 주의성분`,
          weight: pw * 2,
        });
        if (rPenaltyRef) rPenaltyRef.sum += pw * 2;
      }

      if (!tags.includes(`avoid:${axis}`) && avoidCol.includes(axis)) {
        penaltySum += pw * 2;
        details.push({
          name: ing.name,
          position: ing.position ?? total,
          axisLabel: axis,
          contribution: 'penalty',
          reason: `${axis}타입 주의 (라이브러리 판별)`,
          weight: pw * 2,
        });
        if (rPenaltyRef) rPenaltyRef.sum += pw * 2;
      }

      if (axis === 'S' && ing.is_sensitizing) {
        penaltySum += pw * 1.5;
        details.push({
          name: ing.name,
          position: ing.position ?? total,
          axisLabel: 'S',
          contribution: 'penalty',
          reason: '민감성 유발 성분 (is_sensitizing)',
          weight: pw * 1.5,
        });
        if (rPenaltyRef) rPenaltyRef.sum += pw * 1.5;
      }
    }
    return { benefit: benefitSum, penalty: penaltySum, totalW };
  };

  const normPcts = (s1: number, s2: number): [number, number] => {
    const t = s1 + s2;
    if (t === 0) return [50, 50];
    const p1 = Math.round((s1 / t) * 100);
    return [p1, 100 - p1];
  };

  const doDetails: AxisIngredientDetail[] = [];
  const dRes = computeOneAxis('D', doDetails);
  const oRes = computeOneAxis('O', doDetails);
  const dScore = dRes.totalW > 0 ? Math.max(0, (dRes.benefit - dRes.penalty) / dRes.totalW) : 0;
  const oScore = oRes.totalW > 0 ? Math.max(0, (oRes.benefit - oRes.penalty) / oRes.totalW) : 0;

  const srDetails: AxisIngredientDetail[] = [];
  const rPenaltyRef = { sum: 0 };
  let srTotalW = 0;
  for (const ing of ingredients) srTotalW += posW(ing.position ?? total);
  const sRes = computeOneAxis('S', srDetails, rPenaltyRef);
  const sScore = sRes.totalW > 0 ? Math.max(0, (sRes.benefit - sRes.penalty) / sRes.totalW) : 0;
  const rScore = srTotalW > 0 ? rPenaltyRef.sum / srTotalW : 0;
  const rDetails: AxisIngredientDetail[] = srDetails
    .filter((d) => d.contribution === 'penalty')
    .map((d) => ({ ...d, axisLabel: 'R', contribution: 'benefit' as const, reason: d.reason + ' → 저항성(R) 피부엔 적합' }));

  const pnDetails: AxisIngredientDetail[] = [];
  const pRes = computeOneAxis('P', pnDetails);
  const pScore = pRes.totalW > 0 ? Math.max(0, (pRes.benefit - pRes.penalty) / pRes.totalW) : 0;

  const wtDetails: AxisIngredientDetail[] = [];
  const wRes = computeOneAxis('W', wtDetails);
  const wScore = wRes.totalW > 0 ? Math.max(0, (wRes.benefit - wRes.penalty) / wRes.totalW) : 0;

  return [
    { pair: ['D', 'O'], scores: [dScore, oScore], pcts: normPcts(dScore, oScore), details: doDetails.sort((a, b) => b.weight - a.weight), hasContributions: doDetails.length > 0 },
    { pair: ['S', 'R'], scores: [sScore, rScore], pcts: normPcts(sScore, rScore), details: [...srDetails, ...rDetails].sort((a, b) => b.weight - a.weight), hasContributions: srDetails.length > 0 },
    { pair: ['P', 'N'], scores: [pScore, 0], pcts: normPcts(pScore, 0), details: pnDetails.sort((a, b) => b.weight - a.weight), hasContributions: pnDetails.length > 0 },
    { pair: ['W', 'T'], scores: [wScore, 0], pcts: normPcts(wScore, 0), details: wtDetails.sort((a, b) => b.weight - a.weight), hasContributions: wtDetails.length > 0 },
  ];
}
