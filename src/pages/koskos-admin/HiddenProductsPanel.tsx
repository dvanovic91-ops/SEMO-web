import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';
import { categoryLabel } from './types';

/**
 * 숨긴 제품 관리 (백로그 A10). products.is_hidden=true인 제품은 앱 검색·랭킹·추천·듀프·스캔
 * 매칭에서 빠진다(Deepkor 마이그레이션 20260915130000). products에는 수정 RLS가 없어서
 * 숨기기/다시 보이기는 admin_set_product_hidden RPC로만 한다(20260915151000).
 * 검색은 products 공개 읽기 RLS로 직접 조회한다.
 */
type HiddenProduct = {
  id: string;
  brand: string | null;
  name_en: string | null;
  name_kr: string | null;
  category: string | null;
  image_url: string | null;
  hidden_reason: string | null;
  hidden_at: string | null;
};

type SearchResult = {
  id: string;
  brand: string | null;
  name_en: string | null;
  name_kr: string | null;
  category: string | null;
  image_url: string | null;
};

type Props = { onError: (message: string) => void };

/** PostgREST or() 문법을 깨는 문자(쉼표·괄호)와 와일드카드를 걷어낸 검색어 조각들. */
function searchTerms(input: string): string[] {
  return input
    .replace(/[,()%*\\]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 5);
}

export const HiddenProductsPanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<HiddenProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [reason, setReason] = useState('');
  const [hiding, setHiding] = useState(false);
  const searchSeq = useRef(0);

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_hidden_products');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as HiddenProduct[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 제품 검색 — 앱 탐색 화면과 같은 300ms 디바운스. 단어마다 브랜드/영문명/한글명 중 하나에 걸리면 된다.
  useEffect(() => {
    const terms = searchTerms(query);
    if (terms.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      let q = deepkorSupabase
        .from('products')
        .select('id, brand, name_en, name_kr, category, image_url')
        .eq('is_hidden', false);
      for (const t of terms) {
        q = q.or(`brand.ilike.%${t}%,name_en.ilike.%${t}%,name_kr.ilike.%${t}%`);
      }
      const { data, error } = await q.order('brand').order('name_en').limit(30);
      if (seq !== searchSeq.current) return;
      setSearching(false);
      if (error) {
        onError(error.message);
        return;
      }
      setResults((data ?? []) as SearchResult[]);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function unhide(row: HiddenProduct) {
    const label = [row.brand, row.name_en || row.name_kr].filter(Boolean).join(' · ');
    if (!window.confirm(`"${label}"을(를) 앱에 다시 보이게 할까요?`)) return;
    setBusyId(row.id);
    const { error } = await deepkorSupabase.rpc('admin_set_product_hidden', {
      p_product_id: row.id,
      p_hidden: false,
      p_reason: null,
    });
    setBusyId(null);
    if (error) {
      onError(error.message);
      return;
    }
    load();
  }

  async function hide() {
    if (!picked) return;
    const trimmed = reason.trim();
    if (!trimmed) return;
    const label = [picked.brand, picked.name_en || picked.name_kr].filter(Boolean).join(' · ');
    if (!window.confirm(`"${label}"을(를) 앱에서 숨길까요?\n검색·랭킹·추천·듀프·스캔 매칭에서 빠집니다.`)) return;
    setHiding(true);
    const { error } = await deepkorSupabase.rpc('admin_set_product_hidden', {
      p_product_id: picked.id,
      p_hidden: true,
      p_reason: trimmed,
    });
    setHiding(false);
    if (error) {
      onError(error.message);
      return;
    }
    setPicked(null);
    setReason('');
    setResults((prev) => prev.filter((r) => r.id !== picked.id));
    load();
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-medium text-slate-800">숨긴 제품 {rows.length}</p>
            <button type="button" onClick={load} className="text-xs text-slate-500 hover:text-slate-800">
              새로고침
            </button>
          </div>
          {loading ? (
            <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-400">숨긴 제품이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.id} className="flex items-start gap-3 px-4 py-3">
                  <Thumb url={row.image_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-500">
                      {row.brand || '브랜드 없음'} · {categoryLabel(row.category)}
                    </p>
                    <p className="text-sm font-medium text-slate-900">{row.name_en || row.name_kr || '이름 없음'}</p>
                    {row.name_en && row.name_kr && row.name_kr !== row.name_en && (
                      <p className="truncate text-xs text-slate-400">{row.name_kr}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-700">{row.hidden_reason || '사유 없음'}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {row.hidden_at ? new Date(row.hidden_at).toLocaleString('ko-KR') : '날짜 없음'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => unhide(row)}
                    className="shrink-0 rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === row.id ? '처리 중…' : '다시 보이기'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-800">제품 숨기기</p>
          <p className="text-xs text-slate-500">
            앱 검색·랭킹·추천·듀프·스캔 매칭에서 빠집니다. 행은 지우지 않아서 언제든 다시 보이게 할 수 있습니다.
          </p>
          <label className="block text-xs font-medium text-slate-500">
            제품 검색 (브랜드·영문명·한글명)
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: missha tissue"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          {query.trim() && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-100">
              {searching ? (
                <p className="px-3 py-3 text-xs text-slate-400">검색 중…</p>
              ) : results.length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-400">결과 없음 (이미 숨긴 제품은 왼쪽 목록에 있습니다)</p>
              ) : (
                <ul>
                  {results.map((r) => {
                    const active = picked?.id === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setPicked(r)}
                          className={`flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left ${
                            active ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                          }`}
                        >
                          <Thumb url={r.image_url} small />
                          <span className="min-w-0">
                            <span className={`block truncate text-[11px] ${active ? 'text-white/70' : 'text-slate-500'}`}>
                              {r.brand || '브랜드 없음'} · {categoryLabel(r.category)}
                            </span>
                            <span className="block truncate text-sm">{r.name_en || r.name_kr || '이름 없음'}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {picked && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">
              선택: {[picked.brand, picked.name_en || picked.name_kr].filter(Boolean).join(' · ')}
              <span className="block break-all text-[11px] text-slate-400">id: {picked.id}</span>
            </div>
          )}
          <label className="block text-xs font-medium text-slate-500">
            숨기는 이유 (필수)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="예: 폼/비폼 분류 예외, 주력 아님"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={!picked || !reason.trim() || hiding}
            onClick={hide}
            className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {hiding ? '처리 중…' : '숨기기'}
          </button>
        </div>
      </div>

      <HiddenCategorySection onError={onError} />
    </div>
  );
};

/**
 * 카테고리째 숨긴 제품(hair_care 헤어·바디 / other 기타). 앱 UI·홈 추천에서 빠지는 카테고리라
 * 나중에 카테고리를 확장할 때 참고하려고 한곳에 모아 보여주기만 한다 — 편집 기능은 없다.
 * admin_list_hidden_category_products RPC(Deepkor 20260915270000)는 is_hidden 제품을 빼고 돌려준다.
 */
const HIDDEN_CATEGORIES = ['hair_care', 'other'] as const;

type HiddenCategoryProduct = {
  id: string;
  brand: string | null;
  name_en: string | null;
  name_kr: string | null;
  category: string | null;
  image_url: string | null;
};

const HiddenCategorySection: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<HiddenCategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | (typeof HIDDEN_CATEGORIES)[number]>('all');
  const [query, setQuery] = useState('');

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_hidden_category_products');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as HiddenCategoryProduct[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.category ?? ''] = (c[r.category ?? ''] ?? 0) + 1;
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      if (filter !== 'all' && r.category !== filter) return false;
      if (terms.length === 0) return true;
      const hay = [r.brand, r.name_en, r.name_kr].filter(Boolean).join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, filter, query]);

  const chips: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: '전체', count: rows.length },
    ...HIDDEN_CATEGORIES.map((c) => ({ key: c, label: categoryLabel(c), count: counts[c] ?? 0 })),
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-800">숨김 카테고리 (헤어·바디 / 기타) {rows.length}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              카테고리째 앱 화면·홈 추천에서 빠지는 제품입니다. 나중에 카테고리를 확장할 때 참고용으로 모아 둔 보기 전용 목록입니다.
            </p>
          </div>
          <button type="button" onClick={load} className="shrink-0 text-xs text-slate-500 hover:text-slate-800">
            새로고침
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter(chip.key)}
              className={`rounded-full border px-3 py-1 text-xs ${
                filter === chip.key
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {chip.label} {chip.count}
            </button>
          ))}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="브랜드·영문명·한글명 검색"
            className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm sm:w-64"
          />
        </div>
      </div>
      {loading ? (
        <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-8 text-sm text-slate-400">
          {rows.length === 0 ? '숨김 카테고리 제품이 없습니다.' : '조건에 맞는 제품이 없습니다.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((row) => (
            <li key={row.id} className="flex items-start gap-3 px-4 py-3">
              <Thumb url={row.image_url} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-slate-500">
                  {row.brand || '브랜드 없음'} · {categoryLabel(row.category)}
                </p>
                <p className="text-sm font-medium text-slate-900">{row.name_en || row.name_kr || '이름 없음'}</p>
                {row.name_en && row.name_kr && row.name_kr !== row.name_en && (
                  <p className="truncate text-xs text-slate-400">{row.name_kr}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

function Thumb({ url, small = false }: { url: string | null; small?: boolean }) {
  const size = small ? 'h-9 w-9' : 'h-14 w-14';
  return url ? (
    <img src={url} alt="" className={`${size} shrink-0 rounded-lg bg-slate-100 object-contain`} loading="lazy" />
  ) : (
    <div className={`${size} shrink-0 rounded-lg bg-slate-100`} />
  );
}
