import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { lineHasEffectiveDospwAxisSignalForCoverage } from '../../lib/ingredientLibrary';
import { supabase } from '../../lib/supabase';
import { formatSkinApiNetworkError, getSkinApiBaseUrl, skinApiHeaders } from '../../lib/skinApiBaseUrl';

const SKIN_API_URL = getSkinApiBaseUrl();

type SkuCategory = 'beauty' | 'fit' | 'hair';
type AxisKey = 'D' | 'O' | 'S' | 'R' | 'P' | 'N' | 'W' | 'T';

/** 바우만 4쌍: 각 쌍은 좌·우 합이 100% */
const AXIS_PAIRS: {
  id: string;
  left: AxisKey;
  right: AxisKey;
  leftKo: string;
  rightKo: string;
}[] = [
  { id: 'DO', left: 'D', right: 'O', leftKo: '건성', rightKo: '지성' },
  { id: 'SR', left: 'S', right: 'R', leftKo: '민감', rightKo: '저항' },
  { id: 'PN', left: 'P', right: 'N', leftKo: '색소', rightKo: '비색소' },
  { id: 'WT', left: 'W', right: 'T', leftKo: '주름', rightKo: '탄탄' },
];

type PlanningSku = {
  id: string;
  name: string | null;
  brand: string | null;
  product_type: string | null;
  category: SkuCategory | null;
  is_active: boolean | null;
  ingredients_status: string | null;
};

type CompareResult = {
  sku_id: string;
  product_name: string;
  brand: string | null;
  product_type: string | null;
  total_match_pct: number;
  axis_fit: { D: number; O: number; S: number; R: number; P: number; N: number; W: number; T: number };
  top_reasons: string[];
  warnings: string[];
  planning_evaluation?: {
    product_type_key: string;
    tag_multipliers: Record<string, number>;
    note_ko: string;
  };
  ingredient_axes?: Array<{
    key: string;
    label: string;
    value: number;
  }>;
  benchmarks?: {
    product_type_sample_count: number;
    axis_fit_avg: { D: number; O: number; S: number; R: number; P: number; N: number; W: number; T: number };
    ingredient_axes_avg: Array<{ key: string; label: string; value: number }>;
  };
  /** API가 ingredient_axes를 안 주면 프론트에서 유형별 기본 축만 채움(점수 50) */
  _ingredient_axes_source?: 'api' | 'fallback';
};

const axisPairTooltipLabels: Array<{ left: AxisKey; right: AxisKey; key: string }> = [
  { left: 'D', right: 'O', key: 'D/O' },
  { left: 'S', right: 'R', key: 'S/R' },
  { left: 'P', right: 'N', key: 'P/N' },
  { left: 'W', right: 'T', key: 'W/T' },
];

/** 0~100, API 누락·NaN 시 50 */
function clampAxisFitPct(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function axisFitRow(fit: CompareResult['axis_fit'] | undefined): Record<AxisKey, number> {
  const keys: AxisKey[] = ['D', 'O', 'S', 'R', 'P', 'N', 'W', 'T'];
  const raw = fit ?? ({} as Partial<Record<AxisKey, unknown>>);
  return Object.fromEntries(keys.map((k) => [k, clampAxisFitPct(raw[k])])) as Record<AxisKey, number>;
}

function buildMatchTooltip(r: CompareResult): string {
  const axisSummary = axisPairTooltipLabels
    .map(({ left, right, key }) => `${key} ${r.axis_fit[left]}/${r.axis_fit[right]}`)
    .join(' · ');
  const reasons = r.top_reasons.length > 0 ? r.top_reasons.join(' · ') : '근거 성분 데이터 부족';
  const caution = r.warnings.length > 0 ? `\n주의: ${r.warnings.join(' · ')}` : '';
  return `총 매칭 ${r.total_match_pct}%\n근거: ${reasons}\n축 점수: ${axisSummary}${caution}`;
}

function buildSuitabilityRadarData(targetAxis: Record<AxisKey, number>, productAxis: CompareResult['axis_fit']) {
  return [
    { axis: 'DO', target: targetAxis.D, product: productAxis.D },
    { axis: 'SR', target: targetAxis.S, product: productAxis.S },
    { axis: 'PN', target: targetAxis.P, product: productAxis.P },
    { axis: 'WT', target: targetAxis.W, product: productAxis.W },
  ];
}

function buildIngredientRadarData(r: CompareResult) {
  const axes = r.ingredient_axes ?? [];
  if (axes.length > 0) {
    return axes.map((a) => ({ axis: a.label, product: a.value }));
  }
  return [
    { axis: '보습', product: 50 },
    { axis: '유분', product: 50 },
    { axis: '진정', product: 50 },
    { axis: '장벽', product: 50 },
    { axis: '톤케어', product: 50 },
    { axis: '탄력', product: 50 },
  ];
}

function buildDualSuitabilityRadarData(
  targetAxis: Record<AxisKey, number>,
  left: CompareResult,
  right: CompareResult,
) {
  const sameType = left.planning_evaluation?.product_type_key && left.planning_evaluation?.product_type_key === right.planning_evaluation?.product_type_key;
  const avg = sameType ? left.benchmarks?.axis_fit_avg : undefined;
  const a = axisFitRow(left.axis_fit);
  const b = axisFitRow(right.axis_fit);
  /** Recharts에서 `dataKey="right"` 등이 레이아웃 속성과 충돌할 수 있어 `p1`/`p2` 사용 */
  return [
    { axis: 'DO', desc: '건성(D) vs 지성(O) 성향 축입니다.', target: targetAxis.D, p1: a.D, p2: b.D, avg: avg?.D != null ? clampAxisFitPct(avg.D) : null },
    { axis: 'SR', desc: '민감(S) vs 저항(R) 성향 축입니다.', target: targetAxis.S, p1: a.S, p2: b.S, avg: avg?.S != null ? clampAxisFitPct(avg.S) : null },
    { axis: 'PN', desc: '색소(P) vs 비색소(N) 성향 축입니다.', target: targetAxis.P, p1: a.P, p2: b.P, avg: avg?.P != null ? clampAxisFitPct(avg.P) : null },
    { axis: 'WT', desc: '주름(W) vs 탄탄(T) 성향 축입니다.', target: targetAxis.W, p1: a.W, p2: b.W, avg: avg?.W != null ? clampAxisFitPct(avg.W) : null },
  ];
}

function buildDualIngredientRadarData(left: CompareResult, right: CompareResult) {
  const leftAxes = left.ingredient_axes ?? [];
  const rightAxes = right.ingredient_axes ?? [];
  const keys = Array.from(new Set([...leftAxes.map((a) => a.key), ...rightAxes.map((a) => a.key)]));
  if (keys.length === 0) {
    return [
      { axis: '보습', p1: 50, p2: 50 },
      { axis: '유분', p1: 50, p2: 50 },
      { axis: '진정', p1: 50, p2: 50 },
      { axis: '장벽', p1: 50, p2: 50 },
      { axis: '톤케어', p1: 50, p2: 50 },
      { axis: '탄력', p1: 50, p2: 50 },
    ];
  }
  const leftMap = new Map(leftAxes.map((a) => [a.key, a]));
  const rightMap = new Map(rightAxes.map((a) => [a.key, a]));
  const avgMap = new Map((left.benchmarks?.ingredient_axes_avg ?? []).map((a) => [a.key, a.value]));
  const sameType = left.planning_evaluation?.product_type_key && left.planning_evaluation?.product_type_key === right.planning_evaluation?.product_type_key;
  return keys.map((k) => ({
    axis: leftMap.get(k)?.label ?? rightMap.get(k)?.label ?? k,
    key: k,
    p1: clampAxisFitPct(leftMap.get(k)?.value ?? 50),
    p2: clampAxisFitPct(rightMap.get(k)?.value ?? 50),
    avg: sameType ? (avgMap.get(k) != null ? clampAxisFitPct(avgMap.get(k)) : null) : null,
  }));
}

function benchmarkMeta(left: CompareResult, right: CompareResult): {
  sameType: boolean;
  sampleCount: number | null;
  confidence: 'low' | 'medium' | 'high' | null;
} {
  const sameType =
    Boolean(left.planning_evaluation?.product_type_key) &&
    left.planning_evaluation?.product_type_key === right.planning_evaluation?.product_type_key;
  if (!sameType) return { sameType: false, sampleCount: null, confidence: null };
  const n = left.benchmarks?.product_type_sample_count ?? right.benchmarks?.product_type_sample_count ?? null;
  if (n == null) return { sameType: true, sampleCount: null, confidence: null };
  if (n < 20) return { sameType: true, sampleCount: n, confidence: 'low' };
  if (n < 50) return { sameType: true, sampleCount: n, confidence: 'medium' };
  return { sameType: true, sampleCount: n, confidence: 'high' };
}

const INGREDIENT_AXIS_DESC: Record<string, string> = {
  cleanse_power: '피지·노폐물을 씻어내는 세정 관련 성분 기여도입니다.',
  barrier_friendly: '세정 과정에서 장벽 부담을 줄이는 성분 조합 지표입니다.',
  low_irritation: '자극 가능 성분 패널티를 반영한 저자극 지표입니다.',
  tautness_relief: '세안 후 당김 완화(보습/장벽) 관련 지표입니다.',
  tone_care: '톤 케어(브라이트닝) 관련 성분 기여도입니다.',
  ph_balance: '약산성 지표(추정)입니다. 100에 가까울수록 약산성/저자극 쪽으로 해석합니다.',
  aging_support: '탄력/주름 보조 성분 기여도입니다.',
  hydration: '수분 공급 성분 기여도입니다.',
  soothing: '진정 성분 기여도입니다.',
  texture_prep: '피부결 정돈 및 다음 단계 준비 지표입니다.',
  barrier_support: '장벽 보조 성분 기여도입니다.',
  target_efficacy: '제품의 핵심 타겟 효능(미백/주름) 기여도입니다.',
  antioxidant: '항산화 보조 성분 기여도입니다.',
  delivery: '전달/흡수 보조 성분 기여도입니다.',
  stability: '제형 안정화 및 자극 완화 관련 지표입니다.',
  concentrate: '고농축 효능 성분 밀도 지표입니다.',
  barrier: '장벽 강화 성분 기여도입니다.',
  tewl_lock: '수분 증발(TEWL) 억제에 유리한 성분 지표입니다.',
  brightening: '브라이트닝(톤 개선) 성분 기여도입니다.',
  anti_aging: '안티에이징(주름/탄력) 성분 기여도입니다.',
  pore_balance: '유분·모공 밸런스 관련 지표입니다.',
  uv_support: 'UV 방어 보조 성분 기여도입니다.',
  photostability: '광안정성 보조 성분 기여도입니다.',
  tone_finish: '백탁·톤 마무리 관련 성분 지표입니다.',
  cleanse_off: '세정 용이성 관련 성분 지표입니다.',
  oil_balance: '유분 밸런스 지표입니다.',
  tone: '톤 케어 성분 지표입니다.',
  aging: '탄력 보조 성분 지표입니다.',
};

/** API 미배포 등으로 ingredient_axes가 없을 때 유형별 축 라벨만 맞춤(점수는 의미 없음) */
const INGREDIENT_AXIS_FALLBACK: Record<string, Array<{ key: string; label: string }>> = {
  클렌저: [
    { key: 'cleanse_power', label: '세정력' },
    { key: 'barrier_friendly', label: '장벽친화' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'tautness_relief', label: '당김완화' },
    { key: 'ph_balance', label: '약산성지표' },
    { key: 'tone_care', label: '톤케어' },
    { key: 'aging_support', label: '탄력보조' },
  ],
  토너: [
    { key: 'hydration', label: '수분공급' },
    { key: 'soothing', label: '진정' },
    { key: 'texture_prep', label: '결정돈' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'barrier_support', label: '장벽보조' },
    { key: 'aging_support', label: '탄력보조' },
  ],
  세럼: [
    { key: 'target_efficacy', label: '타겟효능' },
    { key: 'antioxidant', label: '항산화' },
    { key: 'delivery', label: '전달·흡수' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'stability', label: '안정성' },
    { key: 'barrier_support', label: '장벽보조' },
  ],
  앰플: [
    { key: 'target_efficacy', label: '타겟효능' },
    { key: 'antioxidant', label: '항산화' },
    { key: 'concentrate', label: '농축도' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'stability', label: '안정성' },
    { key: 'barrier_support', label: '장벽보조' },
  ],
  에센스: [
    { key: 'hydration', label: '수분공급' },
    { key: 'soothing', label: '진정' },
    { key: 'target_efficacy', label: '기능효능' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'stability', label: '안정성' },
    { key: 'barrier_support', label: '장벽보조' },
  ],
  크림: [
    { key: 'hydration', label: '보습지속' },
    { key: 'barrier', label: '장벽강화' },
    { key: 'tewl_lock', label: '수분잠금' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'brightening', label: '브라이트닝' },
    { key: 'anti_aging', label: '안티에이징' },
    { key: 'pore_balance', label: '모공밸런스' },
  ],
  선크림: [
    { key: 'uv_support', label: 'UV방어보조' },
    { key: 'photostability', label: '광안정보조' },
    { key: 'low_irritation', label: '저자극' },
    { key: 'tone_finish', label: '백탁·톤' },
    { key: 'cleanse_off', label: '세정용이' },
    { key: 'antioxidant', label: '항산화보조' },
  ],
  기타: [
    { key: 'hydration', label: '보습' },
    { key: 'oil_balance', label: '유분밸런스' },
    { key: 'soothing', label: '진정' },
    { key: 'barrier', label: '장벽' },
    { key: 'tone', label: '톤케어' },
    { key: 'aging', label: '탄력보조' },
  ],
};

type IngredientSignalCoverage = {
  total: number;
  both: number;
  axisOnly: number;
  tagsOnly: number;
  neither: number;
};

function lineHasBenefitTags(ing: Record<string, unknown>): boolean {
  const tags = ing['benefit_tags'];
  if (!Array.isArray(tags)) return false;
  return tags.some((t) => typeof t === 'string' && t.trim().length > 0);
}

function summarizeIngredientJsonLines(raw: unknown): IngredientSignalCoverage {
  const lines = Array.isArray(raw)
    ? raw.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object' && !Array.isArray(x))
    : [];
  let both = 0;
  let axisOnly = 0;
  let tagsOnly = 0;
  let neither = 0;
  for (const ing of lines) {
    const ax = lineHasEffectiveDospwAxisSignalForCoverage(ing);
    const tg = lineHasBenefitTags(ing);
    if (ax && tg) both += 1;
    else if (ax) axisOnly += 1;
    else if (tg) tagsOnly += 1;
    else neither += 1;
  }
  return { total: lines.length, both, axisOnly, tagsOnly, neither };
}

function formatCoveragePct(n: number, d: number): string {
  if (d <= 0) return '—';
  return `${Math.round((100 * n) / d)}%`;
}

function IngredientCoverageNote({
  coverage,
  loading,
  tone,
}: {
  coverage: IngredientSignalCoverage | undefined;
  loading: boolean;
  tone: 'blue' | 'rose';
}) {
  const border = tone === 'blue' ? 'border-blue-100' : 'border-rose-100';
  const label = tone === 'blue' ? 'text-blue-800' : 'text-rose-800';
  if (loading) {
    return (
      <div className={`mt-2 rounded-lg border ${border} bg-white/60 px-2 py-1.5 text-[10px] text-slate-500`}>
        성분 줄 신호 불러오는 중…
      </div>
    );
  }
  if (!coverage) return null;
  if (coverage.total === 0) {
    return (
      <div className={`mt-2 rounded-lg border ${border} bg-white/60 px-2 py-1.5 text-[10px] text-slate-600`}>
        <span className={`font-semibold ${label}`}>성분 줄 신호</span>
        <span className="mt-0.5 block">저장된 전성분 줄이 없습니다.</span>
      </div>
    );
  }
  const withAxis = coverage.both + coverage.axisOnly;
  const withTags = coverage.both + coverage.tagsOnly;
  const warnNeither = coverage.neither / coverage.total >= 0.35;
  return (
    <div className={`mt-2 rounded-lg border ${border} bg-white/60 px-2 py-1.5 text-[10px] leading-snug text-slate-700`}>
      <span className={`font-semibold ${label}`}>성분 줄 신호</span>
      <p className="mt-0.5">
        총 {coverage.total}줄 · 축값(D/O/S/P/W) {formatCoveragePct(withAxis, coverage.total)} · 태그 {formatCoveragePct(withTags, coverage.total)} · 둘 다
        없음{' '}
        <span className={warnNeither ? 'font-semibold text-amber-700' : ''}>
          {formatCoveragePct(coverage.neither, coverage.total)}
        </span>
      </p>
    </div>
  );
}

function normalizeCompareResult(r: CompareResult): CompareResult {
  const axes = r.ingredient_axes;
  if (axes && axes.length > 0) {
    return { ...r, _ingredient_axes_source: 'api' };
  }
  const pt = r.planning_evaluation?.product_type_key ?? '기타';
  const tpl = INGREDIENT_AXIS_FALLBACK[pt] ?? INGREDIENT_AXIS_FALLBACK['기타'];
  return {
    ...r,
    ingredient_axes: tpl.map((t) => ({ ...t, value: 50 })),
    _ingredient_axes_source: 'fallback',
  };
}

/** 적합도 레이더 각 꼭짓점: 점수는 D·S·P·W 쪽 기여도(반대는 O·R·N·T) */
const SUITABILITY_SPOKE: Record<string, { code: string; high: string; low: string }> = {
  DO: { code: 'DO', high: '건성↑', low: '지성' },
  SR: { code: 'SR', high: '민감↑', low: '저항' },
  PN: { code: 'PN', high: '색소↑', low: '비색소' },
  WT: { code: 'WT', high: '주름↑', low: '탄탄' },
};

type RadarTooltipPayloadItem = {
  name?: string;
  value?: number;
  color?: string;
  payload?: { axis?: string; desc?: string; key?: string };
};

function DualSuitabilityRadarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: RadarTooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pointer-events-none mt-[4.25rem] w-max max-w-[min(280px,92vw)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] leading-snug text-slate-800 shadow-xl ring-1 ring-slate-100">
      <p className="mb-1 text-[10px] font-semibold text-slate-500">지표 값</p>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.name)} className="tabular-nums" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' ? Math.round(p.value) : p.value}/100
          </li>
        ))}
      </ul>
    </div>
  );
}

function DualIngredientRadarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: RadarTooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pointer-events-none mt-[4.25rem] w-max max-w-[min(280px,92vw)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] leading-snug text-slate-800 shadow-xl ring-1 ring-slate-100">
      <p className="mb-1 text-[10px] font-semibold text-slate-500">지표 값</p>
      <ul className="space-y-0.5">
        {payload.map((p) => (
          <li key={String(p.name)} className="tabular-nums" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' ? Math.round(p.value) : p.value}/100
          </li>
        ))}
      </ul>
    </div>
  );
}

function productReasonSummary(r: CompareResult): string {
  if (r._ingredient_axes_source === 'fallback') {
    return `${r.product_type ?? '이 제품'}: API 응답에 성분축(ingredient_axes)이 없습니다. VM/로컬 Flask를 최신 main.py로 재시작했는지 확인하세요. 아래 축은 유형별 라벨만 표시한 것입니다(점수 50은 임시).`;
  }
  const axes = [...(r.ingredient_axes ?? [])].sort((a, b) => b.value - a.value);
  const strong = axes.slice(0, 2).map((a) => a.label).join(', ');
  const weak = axes.slice(-1)[0]?.label ?? '';
  const warningCount = r.warnings.length;
  const warningText = warningCount > 0 ? `주의 성분 ${warningCount}개가 있어요.` : '주의 성분 신호는 낮은 편입니다.';
  if (!strong) return `${r.product_type ?? '이 제품'}은 핵심 성분축 데이터가 아직 부족합니다.`;
  return `${r.product_type ?? '이 제품'}은 ${strong} 쪽 강점이 보입니다. ${
    weak ? `${weak} 축은 상대적으로 약해요. ` : ''
  }${warningText}`;
}

function renderAxisGauges(r: CompareResult, tone: 'blue' | 'red') {
  const axes = r.ingredient_axes ?? [];
  const bg = tone === 'blue' ? 'bg-blue-500' : 'bg-rose-500';
  const avgMap = new Map((r.benchmarks?.ingredient_axes_avg ?? []).map((a) => [a.key, a.value]));
  if (axes.length === 0) {
    return <p className="text-[11px] text-slate-500">성분축 데이터가 없습니다.</p>;
  }
  return (
    <div className="space-y-1.5">
      {r._ingredient_axes_source === 'fallback' && (
        <p className="rounded-md bg-amber-50 px-2 py-1 text-[10px] leading-snug text-amber-900">
          API에 ingredient_axes 없음 → 유형별 축만 표시(50은 임시). Flask 최신 배포 필요.
        </p>
      )}
      {axes.map((a) => {
        const avg = avgMap.has(a.key) ? Math.round(avgMap.get(a.key) ?? 0) : null;
        const barTitle =
          avg != null
            ? `이 제품 ${a.value}/100 · 같은 유형 평균 ${avg}/100 (회색 눈금)`
            : `이 제품 ${a.value}/100 (유형 평균 없음)`;
        return (
          <div key={a.key}>
            <div className="mb-0.5 flex items-center justify-between text-[11px] text-slate-600">
              <span className="group relative inline-flex items-center">
                <span>{a.label}</span>
                <span className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] leading-snug text-slate-700 shadow group-hover:block">
                  {INGREDIENT_AXIS_DESC[a.key] ?? '이 축의 성분 기여도를 나타냅니다.'}
                </span>
              </span>
              <span className="font-semibold">
                {a.value}/100{' '}
                {avg != null ? <span className="text-slate-500">(평균 {avg})</span> : null}
              </span>
            </div>
            <div
              className="group/bar relative h-2 w-full cursor-default rounded-full bg-slate-200"
              role="img"
              aria-label={barTitle}
            >
              <div
                className={`h-2 rounded-full ${bg}`}
                style={{ width: `${Math.max(0, Math.min(100, a.value))}%` }}
              />
              {avg != null ? (
                <div
                  className="pointer-events-none absolute top-0 z-[1] h-2 w-0 -translate-x-1/2 border-l-2 border-slate-600"
                  style={{ left: `${Math.max(0, Math.min(100, avg))}%` }}
                  aria-hidden
                />
              ) : null}
              <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center opacity-0 transition-opacity group-hover/bar:opacity-100">
                <span className="rounded bg-slate-900/85 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
                  {avg != null ? `평균 ${avg}/100` : '평균 없음'}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const categoryOptions: { key: SkuCategory; label: string }[] = [
  { key: 'beauty', label: '뷰티박스' },
  { key: 'fit', label: '핏박스' },
  { key: 'hair', label: '헤어박스' },
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

const AUTO_COMPARE_DEBOUNCE_MS = 380;

const PLANNING_STORAGE_KEY = 'semo_admin_product_planning_v1';

const DEFAULT_AXIS: Record<AxisKey, number> = {
  D: 55,
  O: 45,
  S: 55,
  R: 45,
  P: 45,
  N: 55,
  W: 45,
  T: 55,
};

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 저장된 축 값을 쌍별로 좌측 기준으로 맞춤 (우측은 100−좌) */
function normalizeAxis(raw: Record<AxisKey, number>): Record<AxisKey, number> {
  const D = clampPct(raw.D);
  const S = clampPct(raw.S);
  const P = clampPct(raw.P);
  const W = clampPct(raw.W);
  return {
    D,
    O: 100 - D,
    S,
    R: 100 - S,
    P,
    N: 100 - P,
    W,
    T: 100 - W,
  };
}

function readPersistedPlanning(): {
  category: SkuCategory;
  query: string;
  axis: Record<AxisKey, number>;
  selectedIds: string[];
} {
  const empty = {
    category: 'beauty' as SkuCategory,
    query: '',
    axis: { ...DEFAULT_AXIS },
    selectedIds: [] as string[],
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(PLANNING_STORAGE_KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw) as Record<string, unknown>;
    const category = (['beauty', 'fit', 'hair'] as const).includes(p.category as SkuCategory)
      ? (p.category as SkuCategory)
      : 'beauty';
    const query = typeof p.query === 'string' ? p.query : '';
    let axis = { ...DEFAULT_AXIS };
    if (p.axis && typeof p.axis === 'object' && p.axis !== null) {
      const ax = p.axis as Partial<Record<AxisKey, unknown>>;
      for (const k of ['D', 'O', 'S', 'R', 'P', 'N', 'W', 'T'] as const) {
        const v = ax[k];
        if (typeof v === 'number' && Number.isFinite(v)) {
          axis[k] = clampPct(v);
        }
      }
    }
    axis = normalizeAxis(axis);
    const selectedIds = Array.isArray(p.selectedIds)
      ? (p.selectedIds as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    return { category, query, axis, selectedIds };
  } catch {
    return empty;
  }
}

export default function ProductPlanningTab() {
  const planningInit = useMemo(() => readPersistedPlanning(), []);

  const [category, setCategory] = useState<SkuCategory>(planningInit.category);
  const [query, setQuery] = useState(planningInit.query);
  const [skus, setSkus] = useState<PlanningSku[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(planningInit.selectedIds);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [ingredientCoverage, setIngredientCoverage] = useState<Record<string, IngredientSignalCoverage>>({});
  const [ingredientCoverageLoading, setIngredientCoverageLoading] = useState(false);
  const [axisHoverTip, setAxisHoverTip] = useState<{
    x: number;
    y: number;
    title: string;
    subtitle: string;
  } | null>(null);

  const compareAbortRef = useRef<AbortController | null>(null);
  const autoCompareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 디바운스된 fetch가 항상 최신 슬라이더 값을 쓰도록 (클로저 stale 방지) */
  const compareInputRef = useRef<{
    category: SkuCategory;
    axis: Record<AxisKey, number>;
    selectedIds: string[];
  }>({
    category: planningInit.category,
    axis: planningInit.axis,
    selectedIds: planningInit.selectedIds,
  });

  const [axis, setAxis] = useState<Record<AxisKey, number>>(planningInit.axis);

  compareInputRef.current = { category, axis, selectedIds };

  const loadSkus = useCallback(async () => {
    setLoadingSkus(true);
    setError(null);
    try {
      const { data, error: qErr } = await supabase
        .from('sku_items')
        .select('id,name,brand,product_type,category,is_active,ingredients_status')
        .eq('category', category)
        .order('updated_at', { ascending: false })
        .limit(500);
      if (qErr) throw qErr;
      setSkus((data ?? []) as PlanningSku[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'SKU 목록 로드 실패');
      setSkus([]);
    } finally {
      setLoadingSkus(false);
    }
  }, [category]);

  /** 후보·프로필·검색을 브라우저에 저장 (다른 메뉴 갔다 와도 유지) */
  useEffect(() => {
    try {
      window.localStorage.setItem(
        PLANNING_STORAGE_KEY,
        JSON.stringify({ category, query, axis, selectedIds }),
      );
    } catch {
      /* ignore quota / private mode */
    }
  }, [category, query, axis, selectedIds]);

  /** 선택된 후보의 ingredients_json 으로 축·태그 커버리지 (축값=저장 axis_scores 또는 태그 기반 D~W 추정, 서버 병합과 동일) */
  useEffect(() => {
    if (selectedIds.length < 2) {
      setIngredientCoverage({});
      setIngredientCoverageLoading(false);
      return;
    }
    let cancelled = false;
    setIngredientCoverageLoading(true);
    void (async () => {
      const { data, error: qErr } = await supabase.from('sku_items').select('id, ingredients_json').in('id', selectedIds);
      if (cancelled) return;
      setIngredientCoverageLoading(false);
      if (qErr) {
        setIngredientCoverage({});
        return;
      }
      const next: Record<string, IngredientSignalCoverage> = {};
      for (const row of data ?? []) {
        const id = typeof row.id === 'string' ? row.id : '';
        if (!id) continue;
        next[id] = summarizeIngredientJsonLines(row.ingredients_json);
      }
      setIngredientCoverage(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedIds]);

  /** 이전에 저장된 후보가 있으면 SKU 목록을 한 번 불러 체크박스·비교가 바로 동작하게 함 */
  useEffect(() => {
    if (planningInit.selectedIds.length === 0) return;
    void loadSkus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 저장값 기준으로 1회만
  }, []);

  const setPairFromLeft = (left: AxisKey, right: AxisKey, raw: number) => {
    const v = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
    setAxis((prev) => ({ ...prev, [left]: v, [right]: 100 - v }));
  };

  const filteredSkus = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skus;
    return skus.filter((s) =>
      `${s.brand ?? ''} ${s.name ?? ''} ${s.product_type ?? ''}`.toLowerCase().includes(q),
    );
  }, [query, skus]);

  const skuTypeMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of skus) {
      m.set(s.id, (s.product_type ?? '').trim());
    }
    return m;
  }, [skus]);

  const lockedProductType = useMemo(() => {
    if (selectedIds.length === 0) return null;
    return skuTypeMap.get(selectedIds[0]) ?? null;
  }, [selectedIds, skuTypeMap]);

  const toggleSelect = (id: string) => {
    const clickedType = skuTypeMap.get(id) ?? '';
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length === 0) return [...prev, id];
      const baseType = skuTypeMap.get(prev[0]) ?? '';
      if (clickedType !== baseType) {
        setError(`같은 제품유형만 선택할 수 있습니다. (현재 기준: ${baseType || '유형 미지정'})`);
        return prev;
      }
      return [...prev, id];
    });
  };

  const fetchCompare = useCallback(async () => {
    const { category: cat, axis: ax, selectedIds: ids } = compareInputRef.current;
    if (ids.length < 2) return;
    compareAbortRef.current?.abort();
    const ac = new AbortController();
    compareAbortRef.current = ac;
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`${SKIN_API_URL}/planning/candidate-compare`, {
        method: 'POST',
        headers: skinApiHeaders,
        signal: ac.signal,
        body: JSON.stringify({
          category: cat,
          target_axis: ax,
          candidate_sku_ids: ids,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `비교 실패 (${res.status})`);
      }
      const raw = (payload.results ?? []) as CompareResult[];
      setResults(raw.map(normalizeCompareResult));
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'AbortError') return;
      setError(formatSkinApiNetworkError(e, SKIN_API_URL));
      setResults([]);
    } finally {
      setRunning(false);
    }
  }, []);

  /** 슬라이더·후보 변경 시 자동 재계산(디바운스). 이전 요청은 Abort로 취소 */
  useEffect(() => {
    if (selectedIds.length < 2) return;
    if (autoCompareTimerRef.current) clearTimeout(autoCompareTimerRef.current);
    autoCompareTimerRef.current = setTimeout(() => {
      autoCompareTimerRef.current = null;
      void fetchCompare();
    }, AUTO_COMPARE_DEBOUNCE_MS);
    return () => {
      if (autoCompareTimerRef.current) clearTimeout(autoCompareTimerRef.current);
    };
  }, [axis, category, selectedIds, fetchCompare]);

  const runCompareNow = () => {
    if (selectedIds.length < 2) {
      setError('후보 SKU를 2개 이상 선택하세요.');
      return;
    }
    if (autoCompareTimerRef.current) {
      clearTimeout(autoCompareTimerRef.current);
      autoCompareTimerRef.current = null;
    }
    void fetchCompare();
  };

  const renderSuitabilityAxisTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    const label = String(props.payload?.value ?? '');
    const descMap: Record<string, string> = {
      DO: '건성(D) vs 지성(O) 성향 축입니다.',
      SR: '민감(S) vs 저항(R) 성향 축입니다.',
      PN: '색소(P) vs 비색소(N) 성향 축입니다.',
      WT: '주름(W) vs 탄탄(T) 성향 축입니다.',
    };
    const pole = SUITABILITY_SPOKE[label];
    const desc = descMap[label] ?? '축 설명 없음';
    if (!pole) {
      return (
        <text x={x} y={y} dy={4} textAnchor="middle" fill="#334155" fontSize={14} style={{ cursor: 'default' }}>
          {label}
        </text>
      );
    }
    const showTip = (e: React.MouseEvent<SVGGElement>) => {
      setAxisHoverTip({
        x: e.clientX + 14,
        y: e.clientY + 14,
        title: `${pole.code} · ${desc}`,
        subtitle: `높음=${pole.high.replace('↑', '')} / 낮음=${pole.low}`,
      });
    };
    return (
      <g
        onMouseEnter={showTip}
        onMouseLeave={() => setAxisHoverTip(null)}
        style={{ cursor: 'default' }}
      >
        <rect x={x - 22} y={y - 14} width={44} height={26} fill="transparent" pointerEvents="all" />
        <text x={x} y={y} textAnchor="middle" fill="#334155" pointerEvents="none">
          <tspan x={x} dy="-2" fontSize="13" fontWeight={600}>
            {pole.code}
          </tspan>
          <tspan x={x} dy="13" fontSize="9" fill="#64748b">
            {pole.high}
          </tspan>
        </text>
      </g>
    );
  };

  const renderIngredientAxisTick = (props: { x?: number; y?: number; payload?: { value?: string } }) => {
    const x = props.x ?? 0;
    const y = props.y ?? 0;
    const label = String(props.payload?.value ?? '');
    const key = Object.entries(INGREDIENT_AXIS_FALLBACK)
      .flatMap(([, arr]) => arr)
      .find((a) => a.label === label)?.key;
    const desc = (key && INGREDIENT_AXIS_DESC[key]) || '이 축의 성분 기여도를 나타냅니다.';
    const showTip = (e: React.MouseEvent<SVGGElement>) => {
      setAxisHoverTip({
        x: e.clientX + 14,
        y: e.clientY + 14,
        title: `${label} 축`,
        subtitle: desc,
      });
    };
    return (
      <g
        onMouseEnter={showTip}
        onMouseLeave={() => setAxisHoverTip(null)}
        style={{ cursor: 'default' }}
      >
        <rect x={x - 20} y={y - 10} width={40} height={20} fill="transparent" pointerEvents="all" />
        <text x={x} y={y} dy={4} textAnchor="middle" fill="#334155" fontSize={12} pointerEvents="none">
          {label}
        </text>
      </g>
    );
  };

  return (
    <section className="mt-4 space-y-4">
      {axisHoverTip
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[90] w-[300px] max-w-[92vw] rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] leading-snug text-slate-800 shadow-md"
              style={{ left: axisHoverTip.x, top: axisHoverTip.y }}
            >
              <p className="font-semibold text-slate-900">{axisHoverTip.title}</p>
              <p className="mt-1 text-slate-600">{axisHoverTip.subtitle}</p>
            </div>,
            document.body,
          )
        : null}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">제품 비교 및 기획</h3>
          <button
            type="button"
            onClick={loadSkus}
            disabled={loadingSkus}
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-50"
          >
            {loadingSkus ? '불러오는 중…' : 'SKU 목록 불러오기'}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">카테고리</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as SkuCategory);
                setSelectedIds([]);
                setResults([]);
                setError(null);
              }}
              className={inputClass}
            >
              {categoryOptions.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">후보 검색</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={inputClass}
              placeholder="브랜드/상품명/유형 검색"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">후보 SKU 선택</h4>
            <p className="mt-0.5 text-[11px] text-slate-500">선택·프로필·검색어는 이 브라우저에 저장되어, 다른 메뉴를 갔다 와도 유지됩니다.</p>
            {lockedProductType !== null && (
              <p className="mt-1 text-[11px] text-amber-700">
                선택 잠금 유형: <span className="font-semibold">{lockedProductType || '유형 미지정'}</span> (다른 유형은 선택 불가)
              </p>
            )}
          </div>
          <span className="text-xs text-slate-500">선택 {selectedIds.length}개</span>
        </div>
        <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
          {filteredSkus.length === 0 ? (
            <p className="text-xs text-slate-500">SKU를 먼저 불러오세요.</p>
          ) : (
            filteredSkus.map((s) => {
              const sType = (s.product_type ?? '').trim();
              const checked = selectedIds.includes(s.id);
              const blocked = !checked && lockedProductType !== null && sType !== lockedProductType;
              return (
              <label
                key={s.id}
                className={`flex items-start gap-2 rounded-xl border p-2 text-sm ${blocked ? 'border-slate-100 bg-slate-50/60 opacity-60' : 'border-slate-200'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSelect(s.id)}
                  disabled={blocked}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{s.brand ? `${s.brand} ` : ''}{s.name ?? '(이름 없음)'}</span>
                  <span className="block text-xs text-slate-500">
                    {s.product_type ?? '유형 미지정'} · {s.ingredients_status ?? 'status?'} · {s.is_active ? '활성' : '비활성'}
                    {blocked ? ' · 유형 불일치(선택 불가)' : ''}
                  </span>
                </span>
              </label>
            );
            })
          )}
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={runCompareNow}
            disabled={running}
            className="rounded-full bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {running ? '비교 중…' : '지금 비교 (즉시)'}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h4 className="mb-1 text-sm font-semibold text-slate-900">추천 결과 비교</h4>
        {results.length >= 2 ? (
          <div className="mb-3">
            {(() => {
              const meta = benchmarkMeta(results[0], results[1]);
              if (!meta.sameType) {
                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                    <span className="font-semibold">유형 평균·신뢰도:</span> 두 제품 유형이 달라 같은 유형 평균선은 참고용입니다.
                  </div>
                );
              }
              if (meta.sampleCount == null) {
                return (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                    <span className="font-semibold">유형 평균·신뢰도:</span> 표본수(n)를 불러오지 못했습니다. 비교 API 응답에{' '}
                    <code className="rounded bg-white/80 px-1 text-xs">benchmarks</code>가 있어야 n과 신뢰도가 표시됩니다.
                  </div>
                );
              }
              const badge =
                meta.confidence === 'low' ? '낮음' : meta.confidence === 'medium' ? '보통' : '높음';
              const badgeClass =
                meta.confidence === 'low'
                  ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-200'
                  : meta.confidence === 'medium'
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-200'
                    : 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200';
              return (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 shadow-sm">
                  <span className="font-semibold text-slate-900">같은 유형 평균 기준</span>
                  <span className="tabular-nums text-base font-bold text-slate-900">n = {meta.sampleCount}</span>
                  <span className={`rounded-full px-3 py-1 text-sm font-bold ${badgeClass}`}>
                    평균 신뢰도: {badge}
                  </span>
                </div>
              );
            })()}
          </div>
        ) : null}
        {results.length === 0 ? (
          <p className="text-xs text-slate-500">비교 결과가 여기에 표시됩니다.</p>
        ) : (
          <div className="space-y-3">
            {results.length >= 2 ? (
              <section className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-blue-600" />파란 실선: 1번 제품</span>
                  <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-rose-600" />빨간 실선: 2번 제품</span>
                  <span className="inline-flex items-center gap-1"><span className="h-0.5 w-4 bg-yellow-500" />노란 실선: 같은 유형 평균</span>
                </div>
                <div className="grid gap-3 xl:grid-cols-[1fr_2fr_1fr]">
                  <aside className="rounded-lg border border-blue-100 bg-blue-50/40 p-2.5">
                    <p className="text-xs font-semibold text-blue-700">
                      {results[0].brand ? `${results[0].brand} ` : ''}{results[0].product_name} 근거
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-700">{productReasonSummary(results[0])}</p>
                    <IngredientCoverageNote
                      coverage={ingredientCoverage[results[0].sku_id]}
                      loading={ingredientCoverageLoading}
                      tone="blue"
                    />
                    <p className="mt-2 text-[11px] font-semibold text-blue-700">하위 성분축</p>
                    <div className="mt-1">{renderAxisGauges(results[0], 'blue')}</div>
                  </aside>
                  <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
                    <p className="mb-2 text-[10px] leading-tight text-slate-500 whitespace-nowrap overflow-x-auto [scrollbar-width:thin]">
                      꼭짓점 점수는 각 쌍에서 <strong className="text-slate-700">D·S·P·W</strong> 쪽 비율(0~100)입니다. 높을수록
                      건성·민감·색소·주름 쪽, 낮을수록 지성·저항·비색소·탄탄 쪽입니다. (기준 : 50점)
                    </p>
                    <div className="grid min-w-0 gap-3 md:grid-cols-2">
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold text-slate-700">적합도 (제품 2종 비교)</p>
                        <div
                          className="h-[320px]"
                          onPointerLeave={() => setAxisHoverTip(null)}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart
                              margin={{ top: 24, right: 28, bottom: 24, left: 28 }}
                              data={buildDualSuitabilityRadarData(axis, results[0], results[1])}
                            >
                              <PolarGrid stroke="#374151" strokeOpacity={0.6} />
                              <PolarAngleAxis dataKey="axis" tick={renderSuitabilityAxisTick} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Tooltip
                                content={(props) => <DualSuitabilityRadarTooltip {...props} />}
                                cursor={{ stroke: 'rgba(71, 85, 105, 0.35)', strokeWidth: 1 }}
                                allowEscapeViewBox={{ x: true, y: true }}
                                wrapperStyle={{ outline: 'none', zIndex: 30 }}
                              />
                              <Radar dataKey="avg" name="유형평균" stroke="#eab308" fill="#eab308" fillOpacity={0.05} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                              <Radar dataKey="p1" name="제품1" stroke="#2563eb" fill="#2563eb" fillOpacity={0.18} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                              <Radar dataKey="p2" name="제품2" stroke="#dc2626" fill="#dc2626" fillOpacity={0.14} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="mb-1 text-[11px] font-semibold text-slate-700">
                          성분축 비교 ({results[0].planning_evaluation?.product_type_key ?? '유형'} 기준)
                        </p>
                        <div
                          className="h-[320px]"
                          onPointerLeave={() => setAxisHoverTip(null)}
                        >
                          <ResponsiveContainer width="100%" height="100%">
                            <RadarChart
                              margin={{ top: 24, right: 28, bottom: 24, left: 28 }}
                              data={buildDualIngredientRadarData(results[0], results[1])}
                            >
                              <PolarGrid stroke="#374151" strokeOpacity={0.6} />
                              <PolarAngleAxis dataKey="axis" tick={renderIngredientAxisTick} />
                              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                              <Tooltip
                                content={(props) => <DualIngredientRadarTooltip {...props} />}
                                cursor={{ stroke: 'rgba(71, 85, 105, 0.35)', strokeWidth: 1 }}
                                allowEscapeViewBox={{ x: true, y: true }}
                                wrapperStyle={{ outline: 'none', zIndex: 30 }}
                              />
                              <Radar dataKey="avg" name="유형평균" stroke="#eab308" fill="#eab308" fillOpacity={0.05} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                              <Radar dataKey="p1" name="제품1" stroke="#2563eb" fill="#2563eb" fillOpacity={0.18} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                              <Radar dataKey="p2" name="제품2" stroke="#dc2626" fill="#dc2626" fillOpacity={0.14} dot={{ r: 2 }} activeDot={{ r: 4 }} />
                            </RadarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                  <aside className="rounded-lg border border-rose-100 bg-rose-50/40 p-2.5">
                    <p className="text-xs font-semibold text-rose-700">
                      {results[1].brand ? `${results[1].brand} ` : ''}{results[1].product_name} 근거
                    </p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-700">{productReasonSummary(results[1])}</p>
                    <IngredientCoverageNote
                      coverage={ingredientCoverage[results[1].sku_id]}
                      loading={ingredientCoverageLoading}
                      tone="rose"
                    />
                    <p className="mt-2 text-[11px] font-semibold text-rose-700">하위 성분축</p>
                    <div className="mt-1">{renderAxisGauges(results[1], 'red')}</div>
                  </aside>
                </div>
                <p className="mt-2 text-[9px] leading-snug text-slate-500">
                  「축값」은 줄에 저장된 <code className="rounded bg-slate-100 px-1">axis_scores</code>가 있거나,{' '}
                  <code className="rounded bg-slate-100 px-1">benefit_tags</code>로 D~W를 추정할 수 있으면 집계합니다(하위 성분축·서버 병합과 같은
                  방향). 라이브러리/Gemini 축만 있고 줄에 안 박힌 경우는 전성분 재수집·재고 저장 병합 후 DB가 갱신되면 반영됩니다.
                </p>
              </section>
            ) : (
              <p className="text-xs text-slate-500">비교 그래프는 후보 2개 이상에서 표시됩니다.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
