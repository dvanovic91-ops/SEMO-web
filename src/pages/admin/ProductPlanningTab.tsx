import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getSkinApiBaseUrl } from '../../lib/skinApiBaseUrl';

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
};

const categoryOptions: { key: SkuCategory; label: string }[] = [
  { key: 'beauty', label: '뷰티박스' },
  { key: 'fit', label: '핏박스' },
  { key: 'hair', label: '헤어박스' },
];

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

const AUTO_COMPARE_DEBOUNCE_MS = 380;

export default function ProductPlanningTab() {
  const [category, setCategory] = useState<SkuCategory>('beauty');
  const [query, setQuery] = useState('');
  const [skus, setSkus] = useState<PlanningSku[]>([]);
  const [loadingSkus, setLoadingSkus] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CompareResult[]>([]);

  const compareAbortRef = useRef<AbortController | null>(null);
  const autoCompareTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 디바운스된 fetch가 항상 최신 슬라이더 값을 쓰도록 (클로저 stale 방지) */
  const compareInputRef = useRef<{
    category: SkuCategory;
    axis: Record<AxisKey, number>;
    selectedIds: string[];
  }>({
    category: 'beauty',
    axis: {
      D: 55,
      O: 45,
      S: 55,
      R: 45,
      P: 45,
      N: 55,
      W: 45,
      T: 55,
    },
    selectedIds: [],
  });

  const [axis, setAxis] = useState<Record<AxisKey, number>>({
    D: 55,
    O: 45,
    S: 55,
    R: 45,
    P: 45,
    N: 55,
    W: 45,
    T: 55,
  });

  compareInputRef.current = { category, axis, selectedIds };

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

  const loadSkus = async () => {
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
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
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
        headers: { 'Content-Type': 'application/json' },
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
      setResults((payload.results ?? []) as CompareResult[]);
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'AbortError') return;
      setError(e instanceof Error ? e.message : '비교 실패');
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

  return (
    <section className="mt-4 space-y-4">
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
        <h4 className="mb-1 text-sm font-semibold text-slate-900">타겟 피부 프로필 (네 쌍)</h4>
        <p className="mb-4 text-xs text-slate-500">
          <span className="font-medium text-slate-700">D/O · S/R · P/N · W/T</span> 각 쌍은 합계 100%입니다. 슬라이더로 조정하거나 아래 숫자를 직접 입력할 수 있습니다.
          {selectedIds.length >= 2 && (
            <span className="mt-1 block text-[11px] text-brand">
              후보가 2개 이상이면 프로필을 움직일 때마다 약 {AUTO_COMPARE_DEBOUNCE_MS / 1000}초 뒤 매칭률이 자동으로 다시 계산됩니다.
            </span>
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {AXIS_PAIRS.map(({ id, left, right, leftKo, rightKo }) => {
            const lv = axis[left];
            const rv = axis[right];
            return (
              <div
                key={id}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
                  <span className="text-sm font-semibold tracking-tight text-slate-900">
                    {left} / {right}
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {leftKo} ↔ {rightKo}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={lv}
                  onChange={(e) => setPairFromLeft(left, right, Number(e.target.value))}
                  className="mt-1 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand"
                  aria-label={`${left} 대 ${right} 비율`}
                />
                <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                  <label className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="shrink-0 font-semibold text-brand">{left}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={lv}
                      onChange={(e) => setPairFromLeft(left, right, e.target.value)}
                      className={`${inputClass} max-w-[4.5rem] py-1.5 text-center tabular-nums`}
                    />
                    <span className="shrink-0 text-slate-500">%</span>
                  </label>
                  <span className="text-slate-300" aria-hidden>
                    |
                  </span>
                  <label className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
                    <span className="shrink-0 font-semibold text-slate-700">{right}</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={rv}
                      onChange={(e) => setPairFromLeft(left, right, 100 - Number(e.target.value))}
                      className={`${inputClass} max-w-[4.5rem] py-1.5 text-center tabular-nums`}
                    />
                    <span className="shrink-0 text-slate-500">%</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">후보 SKU 선택</h4>
          <span className="text-xs text-slate-500">선택 {selectedIds.length}개</span>
        </div>
        <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
          {filteredSkus.length === 0 ? (
            <p className="text-xs text-slate-500">SKU를 먼저 불러오세요.</p>
          ) : (
            filteredSkus.map((s) => (
              <label key={s.id} className="flex items-start gap-2 rounded-xl border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">{s.brand ? `${s.brand} ` : ''}{s.name ?? '(이름 없음)'}</span>
                  <span className="block text-xs text-slate-500">
                    {s.product_type ?? '유형 미지정'} · {s.ingredients_status ?? 'status?'} · {s.is_active ? '활성' : '비활성'}
                  </span>
                </span>
              </label>
            ))
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
        <h4 className="mb-3 text-sm font-semibold text-slate-900">추천 결과</h4>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
          총 매칭은 SKU의 <span className="font-medium text-slate-600">제품 유형</span>마다 다른 효능 태그 가중(예: 클렌저는 미백·주름 태그 반영을 낮춤)을 적용합니다. 아래 한 줄 설명을 참고하세요.
        </p>
        {results.length === 0 ? (
          <p className="text-xs text-slate-500">비교 결과가 여기에 표시됩니다.</p>
        ) : (
          <div className="space-y-3">
            {results.map((r, idx) => (
              <article key={r.sku_id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    #{idx + 1} {r.brand ? `${r.brand} ` : ''}{r.product_name}
                  </p>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    총 매칭 {r.total_match_pct}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.product_type ?? '유형 미지정'}</p>
                {r.planning_evaluation?.note_ko && (
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] leading-snug text-slate-600">
                    {r.planning_evaluation.note_ko}
                  </p>
                )}
                <p className="mt-2 text-xs text-slate-700">
                  D/O {r.axis_fit.D}/{r.axis_fit.O} · S/R {r.axis_fit.S}/{r.axis_fit.R} · P/N {r.axis_fit.P}/{r.axis_fit.N} · W/T {r.axis_fit.W}/{r.axis_fit.T}
                </p>
                {r.top_reasons.length > 0 && (
                  <p className="mt-2 text-xs text-slate-700">근거: {r.top_reasons.join(' · ')}</p>
                )}
                {r.warnings.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">주의: {r.warnings.join(' · ')}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
