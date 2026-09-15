import React, { useEffect, useMemo, useRef, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

/**
 * 성분검사 대기함 — 보기 전용. 사전에 없는 성분 이름(오타·옛 표기·새 성분·원문 깨짐)이 등록·스캔·제보
 * 어디서 나오든 ingredient_review_queue에 모인다(Deepkor 20260915370000~, docs/성분검사_대기함_설계.md).
 * 처리는 Claude가 resolve_ingredient_review로 하고, 이 화면은 현황만 보여준다 — 쓰기 버튼을 두지 않는다.
 *
 * 읽기 함수(관리자 전용):
 *  - admin_ingredient_review_summary() — 상태×출처별 이름 수·등장 수·가장 오래된 대기 날짜
 *  - admin_list_ingredient_review_queue(p_status, p_limit) — 이름 하나당 한 줄(최대 2000)
 *  - admin_get_ingredient_review_occurrences(p_queue_id) — 그 이름이 나온 제품·제보·스캔
 * "막힌 숨김 제품·제보 수"를 한 번에 주는 함수는 없어서, 대기 이름마다 occurrences를 불러 합친다
 * (제품이 여러 이름에 걸쳐 있으니 목록의 product_count를 그냥 더하면 중복으로 부풀려진다).
 */

type Status = 'pending' | 'resolved' | 'ignored';
type Source = 'registration' | 'scan' | 'submission';

type QueueRow = {
  id: string;
  norm_key: string;
  raw_example: string;
  status: Status;
  resolution: string | null;
  alias_basis: string | null;
  inci_key: string | null;
  evidence: string | null;
  evidence_urls: string[] | null;
  suggestion_kind: string | null;
  suggestion_keys: string[] | null;
  suggestion_note: string | null;
  occurrence_count: number;
  product_count: number;
  submission_count: number;
  scan_count: number;
  sources: Source[] | null;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
};

type SummaryRow = {
  status: Status;
  source: Source | null;
  names: number;
  occurrences: number;
  oldest_pending: string | null;
};

type Occurrence = {
  source: Source;
  raw_text: string;
  product_id: string | null;
  brand: string | null;
  product_name: string | null;
  product_hidden: boolean | null;
  pending_submission_id: string | null;
  submission_status: string | null;
  token_position: number | null;
  seen_count: number;
  first_seen_at: string;
  last_seen_at: string;
  handled_at: string | null;
  note: string | null;
};

type IngredientName = { inci_key: string; name_en: string | null; name_kr: string | null };

type Blocking = {
  done: number;
  total: number;
  failed: number;
  hiddenProducts: number;
  gateProducts: number;
  pendingSubmissions: number;
  visibleProducts: number;
};

type Props = { onError: (message: string) => void };

const LIST_LIMIT = 2000;
const OCCURRENCE_CONCURRENCY = 6;

const STATUS_LABELS: Record<Status, string> = {
  pending: '대기',
  resolved: '처리됨',
  ignored: '무시',
};

const SOURCE_LABELS: Record<Source, string> = {
  registration: '등록',
  scan: '스캔',
  submission: '제보',
};
const SOURCES: Source[] = ['registration', 'scan', 'submission'];

const SUGGESTION_LABELS: Record<string, string> = {
  spelling_rule: '표기 규칙',
  spelling_rule_ambiguous: '표기 규칙(후보 여럿)',
  label_noise: '라벨·군더더기 제거',
  split_two: '둘로 나누기(쉼표 누락)',
  typo_candidate: '오타 후보',
  near_name: '비슷한 이름(공식 확인 필요)',
  none: '제안 없음',
};
const SUGGESTION_ORDER = ['spelling_rule', 'label_noise', 'split_two', 'typo_candidate', 'near_name', 'spelling_rule_ambiguous', 'none'];

const RESOLUTION_LABELS: Record<string, string> = {
  alias: '별칭 연결',
  spelling_rule: '표기 규칙 확인',
  raw_fix: '원문 수정',
  new_ingredient: '새 성분 추가',
  ignored: '무시',
};

const ALIAS_BASIS_LABELS: Record<string, string> = {
  typo: '오타',
  spelling: '옛 표기',
  synonym: '다른 이름',
};

const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  pending: '승인 대기',
  approved: '승인됨',
  rejected: '거절',
};

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  return Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
}

async function fetchStatus(status: Status): Promise<QueueRow[]> {
  const { data, error } = await deepkorSupabase.rpc('admin_list_ingredient_review_queue', {
    p_status: status,
    p_limit: LIST_LIMIT,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as QueueRow[];
}

async function fetchOccurrences(queueId: string): Promise<Occurrence[]> {
  const { data, error } = await deepkorSupabase.rpc('admin_get_ingredient_review_occurrences', {
    p_queue_id: queueId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Occurrence[];
}

export const IngredientReviewQueuePanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<Record<Status, QueueRow[]>>({ pending: [], resolved: [], ignored: [] });
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [kindFilter, setKindFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [occurrences, setOccurrences] = useState<Record<string, Occurrence[]>>({});
  const [occLoading, setOccLoading] = useState<Set<string>>(new Set());
  const [names, setNames] = useState<Record<string, IngredientName>>({});
  const [blocking, setBlocking] = useState<Blocking | null>(null);
  const loadSeq = useRef(0);

  async function load() {
    const seq = ++loadSeq.current;
    setLoading(true);
    setBlocking(null);
    setOccurrences({});
    try {
      const [pending, resolved, ignored, sum, hidden] = await Promise.all([
        fetchStatus('pending'),
        fetchStatus('resolved'),
        fetchStatus('ignored'),
        deepkorSupabase.rpc('admin_ingredient_review_summary'),
        deepkorSupabase.rpc('admin_list_hidden_products'),
      ]);
      if (seq !== loadSeq.current) return;
      if (sum.error) throw new Error(sum.error.message);
      setRows({ pending, resolved, ignored });
      setSummary((sum.data ?? []) as SummaryRow[]);
      setLoadedAt(new Date());
      setLoading(false);

      const gateIds = new Set(
        hidden.error
          ? []
          : ((hidden.data ?? []) as { id: string; hidden_reason: string | null }[])
              .filter((p) => p.hidden_reason === 'link_audit_pending')
              .map((p) => p.id),
      );
      loadIngredientNames([...pending, ...resolved, ...ignored], seq);
      computeBlocking(pending, gateIds, seq);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setLoading(false);
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  /** 연결된 성분·제안 후보의 사전 이름(ingredient_library는 공개 읽기). */
  async function loadIngredientNames(all: QueueRow[], seq: number) {
    const keys = new Set<string>();
    for (const r of all) {
      if (r.inci_key) keys.add(r.inci_key);
      for (const k of r.suggestion_keys ?? []) keys.add(k);
    }
    const list = [...keys];
    const found: Record<string, IngredientName> = {};
    for (let i = 0; i < list.length; i += 80) {
      const { data, error } = await deepkorSupabase
        .from('ingredient_library')
        .select('inci_key, name_en, name_kr')
        .in('inci_key', list.slice(i, i + 80));
      if (seq !== loadSeq.current) return;
      if (error) return; // 이름은 보조 정보 — 실패해도 inci_key로 보여준다
      for (const n of (data ?? []) as IngredientName[]) found[n.inci_key] = n;
    }
    setNames(found);
  }

  /** 대기 이름마다 occurrences를 불러 막힌 숨김 제품·제보를 중복 없이 센다. 펼치기 캐시로도 쓴다. */
  async function computeBlocking(pending: QueueRow[], gateIds: Set<string>, seq: number) {
    const targets = pending.filter((r) => r.product_count + r.submission_count > 0);
    const hiddenProducts = new Set<string>();
    const gateProducts = new Set<string>();
    const pendingSubmissions = new Set<string>();
    const visibleProducts = new Set<string>();
    const cache: Record<string, Occurrence[]> = {};
    let done = 0;
    let failed = 0;
    let next = 0;
    const publish = () =>
      setBlocking({
        done,
        total: targets.length,
        failed,
        hiddenProducts: hiddenProducts.size,
        gateProducts: gateProducts.size,
        pendingSubmissions: pendingSubmissions.size,
        visibleProducts: visibleProducts.size,
      });
    publish();

    async function worker() {
      while (next < targets.length) {
        const row = targets[next++];
        try {
          const occ = await fetchOccurrences(row.id);
          if (seq !== loadSeq.current) return;
          cache[row.id] = occ;
          for (const o of occ) {
            if (o.handled_at) continue;
            if (o.product_id) {
              if (o.product_hidden) {
                hiddenProducts.add(o.product_id);
                if (gateIds.has(o.product_id)) gateProducts.add(o.product_id);
              } else {
                visibleProducts.add(o.product_id);
              }
            }
            if (o.pending_submission_id && o.submission_status === 'pending') {
              pendingSubmissions.add(o.pending_submission_id);
            }
          }
        } catch {
          failed++;
        }
        if (seq !== loadSeq.current) return;
        done++;
        if (done % 20 === 0 || done === targets.length) {
          publish();
          setOccurrences((prev) => ({ ...cache, ...prev }));
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(OCCURRENCE_CONCURRENCY, targets.length) }, worker));
    if (seq !== loadSeq.current) return;
    publish();
    setOccurrences((prev) => ({ ...cache, ...prev }));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(row: QueueRow) {
    const next = new Set(expanded);
    if (next.has(row.id)) {
      next.delete(row.id);
      setExpanded(next);
      return;
    }
    next.add(row.id);
    setExpanded(next);
    if (occurrences[row.id]) return;
    setOccLoading((s) => new Set(s).add(row.id));
    try {
      const occ = await fetchOccurrences(row.id);
      setOccurrences((prev) => ({ ...prev, [row.id]: occ }));
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setOccLoading((s) => {
        const n = new Set(s);
        n.delete(row.id);
        return n;
      });
    }
  }

  const pendingSummary = useMemo(() => {
    const bySource: Record<string, { names: number; occurrences: number }> = {};
    let oldest: string | null = null;
    for (const s of summary) {
      if (s.status !== 'pending') continue;
      if (s.source) bySource[s.source] = { names: s.names, occurrences: s.occurrences };
      if (s.oldest_pending && (!oldest || s.oldest_pending < oldest)) oldest = s.oldest_pending;
    }
    return { bySource, oldest };
  }, [summary]);

  const occurrenceTotals = useMemo(() => {
    const t: Record<Status, number> = { pending: 0, resolved: 0, ignored: 0 };
    for (const s of summary) t[s.status] = (t[s.status] ?? 0) + s.occurrences;
    return t;
  }, [summary]);

  const tabRows = useMemo(
    () => (tab === 'pending' ? rows.pending : [...rows.resolved, ...rows.ignored]),
    [tab, rows],
  );

  const kindCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows.pending) {
      const k = r.suggestion_kind ?? 'none';
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [rows.pending]);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return tabRows.filter((r) => {
      if (tab === 'pending' && kindFilter !== 'all' && (r.suggestion_kind ?? 'none') !== kindFilter) return false;
      if (terms.length === 0) return true;
      const linked = r.inci_key ? names[r.inci_key] : undefined;
      const hay = [r.norm_key, r.raw_example, r.inci_key, linked?.name_en, linked?.name_kr]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [tabRows, tab, kindFilter, query, names]);

  const oldestDays = daysSince(pendingSummary.oldest);
  const truncated = (Object.keys(rows) as Status[]).filter((s) => rows[s].length >= LIST_LIMIT);

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">성분검사 대기함</p>
            <p className="mt-0.5 text-xs text-slate-500">
              사전에 없는 성분 이름이 등록·스캔·제보에서 나오면 여기 모입니다. 처리는 Claude가 하고, 이 화면은 보기 전용입니다.
              다른 작업이 대기함을 계속 정리하고 있어 숫자가 바뀔 수 있습니다.
            </p>
          </div>
          <div className="shrink-0 text-right">
            <button type="button" onClick={load} className="text-xs text-slate-500 hover:text-slate-800">
              새로고침
            </button>
            {loadedAt && <p className="mt-0.5 text-[11px] text-slate-400">{loadedAt.toLocaleTimeString('ko-KR')} 기준</p>}
          </div>
        </div>

        {loading ? (
          <p className="pt-4 text-sm text-slate-400">불러오는 중…</p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {(['pending', 'resolved', 'ignored'] as Status[]).map((s) => (
                <Stat
                  key={s}
                  label={STATUS_LABELS[s]}
                  value={rows[s].length}
                  unit="종"
                  sub={`등장 ${occurrenceTotals[s].toLocaleString('ko-KR')}곳`}
                  strong={s === 'pending'}
                />
              ))}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">대기 — 출처별</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-800">
                  {SOURCES.map((src) => {
                    const v = pendingSummary.bySource[src];
                    return (
                      <span key={src}>
                        {SOURCE_LABELS[src]} <b>{v?.names ?? 0}</b>종
                        <span className="ml-1 text-xs text-slate-500">({(v?.occurrences ?? 0).toLocaleString('ko-KR')}곳)</span>
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-slate-600">
                  가장 오래된 대기: <b>{fmtDate(pendingSummary.oldest)}</b>
                  {oldestDays !== null && <span className="ml-1 text-slate-400">({oldestDays}일째)</span>}
                </p>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs font-medium text-slate-500">대기 성분 때문에 막힌 것</p>
                {!blocking ? (
                  <p className="mt-2 text-xs text-slate-400">계산 전</p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-800">
                      <span>
                        숨김 제품 <b>{blocking.hiddenProducts}</b>개
                        {blocking.gateProducts > 0 && (
                          <span className="ml-1 text-xs text-slate-500">(등록 게이트 {blocking.gateProducts})</span>
                        )}
                      </span>
                      <span>
                        승인 대기 제보 <b>{blocking.pendingSubmissions}</b>건
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      이미 공개된 제품 중 대기 성분이 남은 제품 {blocking.visibleProducts}개 (막히진 않음 — 모르는 성분만 빠진 채 노출)
                    </p>
                    {blocking.done < blocking.total && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        세는 중… {blocking.done}/{blocking.total}
                      </p>
                    )}
                    {blocking.failed > 0 && (
                      <p className="mt-1 text-[11px] text-amber-700">{blocking.failed}개 이름은 불러오지 못해 빠졌습니다.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 목록 */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['pending', `대기 ${rows.pending.length}`],
                ['done', `처리됨 ${rows.resolved.length + rows.ignored.length}`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 검색 (원문·연결된 성분)"
              className="ml-auto w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm sm:w-72"
            />
          </div>
          {tab === 'pending' && rows.pending.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {[['all', '전체', rows.pending.length] as const, ...SUGGESTION_ORDER.filter((k) => kindCounts[k]).map(
                (k) => [k, SUGGESTION_LABELS[k] ?? k, kindCounts[k]] as const,
              )].map(([k, label, count]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKindFilter(k)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs ${
                    kindFilter === k
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {label} {count}
                </button>
              ))}
            </div>
          )}
          {truncated.length > 0 && (
            <p className="text-[11px] text-amber-700">
              {truncated.map((s) => STATUS_LABELS[s]).join('·')} 목록은 상위 {LIST_LIMIT}개만 불러왔습니다.
            </p>
          )}
        </div>

        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
        ) : visible.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-400">
            {tabRows.length === 0 ? (tab === 'pending' ? '대기 중인 이름이 없습니다.' : '처리된 이름이 없습니다.') : '조건에 맞는 이름이 없습니다.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((row) => (
              <QueueItem
                key={row.id}
                row={row}
                names={names}
                open={expanded.has(row.id)}
                occurrences={occurrences[row.id]}
                occLoading={occLoading.has(row.id)}
                onToggle={() => toggle(row)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

function Stat({ label, value, unit, sub, strong }: { label: string; value: number; unit: string; sub: string; strong?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${strong ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-900'}`}>
      <p className={`text-xs ${strong ? 'text-white/70' : 'text-slate-500'}`}>{label}</p>
      <p className="mt-1 text-2xl font-semibold">
        {value.toLocaleString('ko-KR')}
        <span className={`ml-1 text-sm font-normal ${strong ? 'text-white/70' : 'text-slate-500'}`}>{unit}</span>
      </p>
      <p className={`text-[11px] ${strong ? 'text-white/60' : 'text-slate-400'}`}>{sub}</p>
    </div>
  );
}

function ingredientLabel(key: string, names: Record<string, IngredientName>): string {
  const n = names[key];
  if (!n) return key;
  const main = n.name_en || key;
  return n.name_kr && n.name_kr !== main ? `${main} (${n.name_kr})` : main;
}

function QueueItem({
  row,
  names,
  open,
  occurrences,
  occLoading,
  onToggle,
}: {
  row: QueueRow;
  names: Record<string, IngredientName>;
  open: boolean;
  occurrences: Occurrence[] | undefined;
  occLoading: boolean;
  onToggle: () => void;
}) {
  const kind = row.suggestion_kind ?? 'none';
  const statusCls =
    row.status === 'pending'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : row.status === 'resolved'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <li>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span className="mt-0.5 w-3 shrink-0 text-xs text-slate-400">{open ? '▾' : '▸'}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all text-sm font-medium text-slate-900">{row.raw_example}</span>
            {row.norm_key !== row.raw_example.toLowerCase() && (
              <span className="break-all text-xs text-slate-400">비교용: {row.norm_key}</span>
            )}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusCls}`}>{STATUS_LABELS[row.status]}</span>
            {(row.sources ?? []).map((s) => (
              <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {SOURCE_LABELS[s] ?? s}
              </span>
            ))}
          </div>

          <p className="text-xs text-slate-600">
            등장 {row.occurrence_count}회 · 제품 {row.product_count} · 제보 {row.submission_count}
            {row.scan_count > 0 && <> · 스캔 {row.scan_count}</>}
          </p>

          {row.status === 'pending' ? (
            <p className="text-xs text-slate-700">
              <span className="mr-1.5 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                {SUGGESTION_LABELS[kind] ?? kind}
              </span>
              {row.suggestion_note}
              {row.suggestion_keys && row.suggestion_keys.length > 0 && (
                <span className="text-slate-500">
                  {' '}
                  — {kind === 'split_two' ? '나눈 조각' : '후보'}:{' '}
                  {row.suggestion_keys.map((k) => ingredientLabel(k, names)).join(kind === 'split_two' ? ' + ' : ' / ')}
                </span>
              )}
            </p>
          ) : (
            <div className="space-y-0.5 text-xs text-slate-700">
              <p>
                <span className="mr-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                  {RESOLUTION_LABELS[row.resolution ?? ''] ?? row.resolution ?? '처리 종류 없음'}
                  {row.alias_basis && ` · ${ALIAS_BASIS_LABELS[row.alias_basis] ?? row.alias_basis}`}
                </span>
                {row.inci_key ? (
                  <>
                    → <b>{ingredientLabel(row.inci_key, names)}</b>
                    <span className="ml-1 text-slate-400">[{row.inci_key}]</span>
                  </>
                ) : (
                  <span className="text-slate-400">연결된 성분 없음</span>
                )}
              </p>
              {row.evidence && <p className="whitespace-pre-wrap text-slate-600">근거: {row.evidence}</p>}
              {row.suggestion_kind && row.suggestion_kind !== 'none' && (
                <p className="text-slate-400">기계 제안: {SUGGESTION_LABELS[row.suggestion_kind] ?? row.suggestion_kind}</p>
              )}
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            처음 {fmtDate(row.first_seen_at)} · 마지막 {fmtDate(row.last_seen_at)}
            {row.resolved_at && <> · 처리 {fmtDate(row.resolved_at)}</>}
          </p>
        </div>
      </button>

      {/* 근거 링크는 버튼 밖에 둔다(링크 클릭이 펼치기와 겹치지 않게) */}
      {row.status !== 'pending' && (row.evidence_urls ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-10 pb-3">
          {(row.evidence_urls ?? []).map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="max-w-full truncate rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:underline"
            >
              {url.replace(/^https?:\/\//, '')}
            </a>
          ))}
        </div>
      )}

      {open && (
        <div className="bg-slate-50 px-10 py-3">
          {occLoading && !occurrences ? (
            <p className="text-xs text-slate-400">불러오는 중…</p>
          ) : !occurrences || occurrences.length === 0 ? (
            <p className="text-xs text-slate-400">등장 기록이 없습니다.</p>
          ) : (
            <OccurrenceTable occurrences={occurrences} />
          )}
        </div>
      )}
    </li>
  );
}

function OccurrenceTable({ occurrences }: { occurrences: Occurrence[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-[11px] text-slate-500">
          <tr>
            <th className="py-1 pr-3 font-medium">출처</th>
            <th className="py-1 pr-3 font-medium">제품 / 제보</th>
            <th className="py-1 pr-3 font-medium">상태</th>
            <th className="py-1 pr-3 font-medium">원문</th>
            <th className="py-1 pr-3 font-medium">위치</th>
            <th className="py-1 pr-3 font-medium">횟수</th>
            <th className="py-1 font-medium">처음 / 마지막</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 text-slate-700">
          {occurrences.map((o, i) => {
            const label = [o.brand, o.product_name].filter(Boolean).join(' · ');
            let state: React.ReactNode = '—';
            if (o.product_id) {
              state = o.product_hidden ? <span className="text-amber-700">숨김</span> : '공개';
            } else if (o.pending_submission_id) {
              const s = o.submission_status ?? '';
              state = <span className={s === 'pending' ? 'text-amber-700' : ''}>{SUBMISSION_STATUS_LABELS[s] ?? (s || '—')}</span>;
            }
            return (
              <tr key={`${o.source}-${o.product_id ?? o.pending_submission_id ?? ''}-${i}`} className="align-top">
                <td className="py-1.5 pr-3">{SOURCE_LABELS[o.source] ?? o.source}</td>
                <td className="py-1.5 pr-3">
                  {label || <span className="text-slate-400">{o.source === 'scan' ? '스캔(제품 미등록)' : '이름 없음'}</span>}
                  {(o.product_id || o.pending_submission_id) && (
                    <span className="block break-all text-[10px] text-slate-400">
                      {o.product_id ? `제품 ${o.product_id}` : `제보 ${o.pending_submission_id}`}
                    </span>
                  )}
                  {o.note && <span className="block text-[10px] text-slate-400">{o.note}</span>}
                </td>
                <td className="py-1.5 pr-3">
                  {state}
                  {o.handled_at && <span className="block text-[10px] text-emerald-700">처리 {fmtDate(o.handled_at)}</span>}
                </td>
                <td className="break-all py-1.5 pr-3 font-mono text-[11px]">{o.raw_text}</td>
                <td className="py-1.5 pr-3">{o.token_position != null ? `#${o.token_position}` : '—'}</td>
                <td className="py-1.5 pr-3">{o.seen_count}</td>
                <td className="py-1.5 text-[11px] text-slate-500">
                  {fmtDate(o.first_seen_at)}
                  {fmtDate(o.last_seen_at) !== fmtDate(o.first_seen_at) && <> / {fmtDate(o.last_seen_at)}</>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
