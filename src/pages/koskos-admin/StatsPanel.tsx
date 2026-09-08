import React, { useEffect, useMemo, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';
import { AXIS_PAIRS, countBaumannAxes } from './baumann';

type NamedCount = { n: number; provider?: string; type?: string; name?: string; brand?: string | null; locale?: string; country?: string; query?: string; reason?: string; category?: string };

type Period = {
  active_users: number;
  active_guests: number;
  active_signed_in: number;
  sessions: number;
  searches: number;
  banner_clicks: number;
  scan_start: number;
  scan_match: number;
  scan_fail: number;
  product_opens: number;
  new_accounts: number;
  new_guests: number;
  new_signed_in: number;
  scans?: number;
  product_views?: number;
};

type Dashboard = {
  timezone: string;
  today_date: string;
  today: Period;
  week: Period;
  funnel_today: { scan_start: number; scan_match: number; scan_fail: number; product_open: number };
  retention: { d1_eligible: number; d1_returned: number; d7_eligible: number; d7_returned: number };
  totals: {
    accounts: number;
    guests: number;
    signed_in: number;
    with_skin_type: number;
    scans: number;
    product_views: number;
    favorites: number;
    reviews: number;
    pending_open: number;
    products?: number;
  };
  product_categories?: NamedCount[];
  providers: NamedCount[];
  locales: NamedCount[];
  countries: NamedCount[];
  baumann: NamedCount[];
  scan_fail_reasons_7d: NamedCount[];
  top_searches_7d: NamedCount[];
  top_scanned_7d: NamedCount[];
  top_viewed_7d: NamedCount[];
};

type Props = { onError: (message: string) => void };

const CATEGORY_KO: Record<string, string> = {
  cleanser: '클렌저',
  toner: '토너',
  essence_serum: '에센스/세럼',
  cream_moisturizer: '크림/수분크림',
  sun_care: '선케어',
  mask_pack: '마스크팩',
  mist_spray: '미스트',
  hair_care: '헤어/바디케어',
  other: '기타',
  unset: '미분류',
};

function pct(part: number, whole: number) {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

export const StatsPanel: React.FC<Props> = ({ onError }) => {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data: row, error } = await deepkorSupabase.rpc('admin_dashboard_stats');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setData(row as Dashboard);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryRows = useMemo(() => {
    const rows = (data?.product_categories ?? []).map((p) => ({
      k: CATEGORY_KO[p.category ?? ''] ?? p.category ?? '—',
      n: p.n,
    }));
    return rows;
  }, [data]);

  if (loading && !data) {
    return <p className="text-sm text-slate-400">불러오는 중…</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-400">통계를 불러오지 못했습니다.</p>;
  }

  const t = data.today;
  const w = data.week;
  const f = data.funnel_today;
  const r = data.retention;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">오늘 {data.today_date}</p>
          <p className="text-xs text-slate-500">
            기준 시간 {data.timezone} · 세션은 앱을 켠 횟수입니다. 세션/검색/스캔 실패는 새 앱 버전부터
            쌓입니다.
          </p>
        </div>
        <button type="button" onClick={load} className="text-xs text-slate-500 hover:text-slate-800">
          새로고침
        </button>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
          <span>항목</span>
          <span>오늘 / 최근 7일</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <PeriodCard
            label="이용자"
            d1={t.active_users}
            d7={w.active_users ?? 0}
            hint={`게스트 ${t.active_guests} · 로그인 ${t.active_signed_in}`}
          />
          <PeriodCard label="세션" d1={t.sessions} d7={w.sessions} hint="앱을 켠 횟수" />
          <PeriodCard label="검색" d1={t.searches} d7={w.searches} />
          <PeriodCard
            label="제품 열람"
            d1={t.product_opens}
            d7={w.product_opens ?? 0}
            hint={`최근본 ${t.product_views ?? 0} / ${w.product_views ?? 0}`}
          />
          <PeriodCard
            label="신규"
            d1={t.new_accounts}
            d7={w.new_accounts}
            hint={`게스트 ${t.new_guests} · 로그인 ${t.new_signed_in}`}
          />
          <PeriodCard label="스캔 시작" d1={t.scan_start} d7={w.scan_start ?? 0} />
          <PeriodCard label="스캔 매칭" d1={t.scan_match} d7={w.scan_match ?? 0} />
          <PeriodCard label="배너 클릭" d1={t.banner_clicks} d7={w.banner_clicks ?? 0} />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-slate-800">오늘 스캔 퍼널</p>
        <div className="grid gap-2 sm:grid-cols-4">
          <StatCard label="시작" value={f.scan_start} />
          <StatCard label="매칭 성공" value={f.scan_match} hint={pct(f.scan_match, f.scan_start)} />
          <StatCard label="실패/제보" value={f.scan_fail} hint={pct(f.scan_fail, f.scan_start)} />
          <StatCard label="제품 상세" value={f.product_open} />
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2">
        <StatCard
          label="D1 재방문"
          value={pct(r.d1_returned, r.d1_eligible)}
          hint={`${r.d1_returned} / ${r.d1_eligible} (최근 14일 신규)`}
        />
        <StatCard
          label="D7 재방문"
          value={pct(r.d7_returned, r.d7_eligible)}
          hint={`${r.d7_returned} / ${r.d7_eligible} (최근 28일 신규)`}
        />
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="전체 계정"
          value={data.totals.signed_in}
          hint={`가입(로그인)만 · 게스트 세션 ${data.totals.guests}은 제외`}
        />
        <StatCard label="피부타입 설정" value={data.totals.with_skin_type} hint="로그인 회원만" />
        <StatCard label="즐겨찾기" value={data.totals.favorites} />
        <StatCard label="리뷰 / 승인대기 제보" value={`${data.totals.reviews} / ${data.totals.pending_open}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard
          title={`등록 제품 ${data.totals.products ?? '—'}`}
          rows={categoryRows}
        />
        <ListCard title="앱 언어" rows={(data.locales ?? []).map((p) => ({ k: p.locale ?? '—', n: p.n }))} />
        <ListCard title="기기 국가" rows={(data.countries ?? []).map((p) => ({ k: p.country ?? '—', n: p.n }))} />
        <ListCard title="로그인 수단" rows={data.providers.map((p) => ({ k: p.provider ?? '—', n: p.n }))} />
        <BaumannCard types={data.baumann} />
        <ListCard title="7일 검색어" rows={(data.top_searches_7d ?? []).map((p) => ({ k: p.query ?? '—', n: p.n }))} />
        <ListCard
          title="7일 스캔 실패 이유"
          rows={(data.scan_fail_reasons_7d ?? []).map((p) => ({ k: p.reason ?? '—', n: p.n }))}
        />
        <ListCard
          title="7일 스캔 상위 제품"
          rows={data.top_scanned_7d.map((p) => ({
            k: [p.brand, p.name].filter(Boolean).join(' · ') || '—',
            n: p.n,
          }))}
        />
        <ListCard
          title="7일 조회 상위 제품"
          rows={data.top_viewed_7d.map((p) => ({
            k: [p.brand, p.name].filter(Boolean).join(' · ') || '—',
            n: p.n,
          }))}
        />
      </div>
    </div>
  );
};

function PeriodCard({
  label,
  d1,
  d7,
  hint,
}: {
  label: string;
  d1: number;
  d7: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-slate-400">오늘</p>
          <p className="text-lg font-semibold tabular-nums leading-tight text-slate-900">{d1}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-400">7일</p>
          <p className="text-lg font-semibold tabular-nums leading-tight text-slate-900">{d7}</p>
        </div>
      </div>
      {hint && <p className="mt-1 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ListCard({ title, rows }: { title: string; rows: { k: string; n: number }[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">아직 없음</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.k} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{r.k}</span>
              <span className="tabular-nums text-slate-900">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BaumannCard({ types }: { types: NamedCount[] }) {
  const rows = types
    .map((p) => ({ type: (p.type ?? '').toUpperCase(), n: p.n }))
    .filter((p) => p.type)
    .sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
  const axes = countBaumannAxes(rows);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="mb-1 text-sm font-medium text-slate-800">바우만 피부타입</p>
      <p className="mb-3 text-[10px] text-slate-400">로그인 회원만 집계합니다. 게스트 테스트는 넣지 않습니다.</p>
      <div className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        {AXIS_PAIRS.map(([a, b]) => (
          <React.Fragment key={a}>
            <p className="flex items-center justify-between gap-3">
              <span className="text-slate-700">{a}</span>
              <span className="tabular-nums text-slate-900">{axes[a] ?? 0}</span>
            </p>
            <p className="flex items-center justify-between gap-3">
              <span className="text-slate-700">{b}</span>
              <span className="tabular-nums text-slate-900">{axes[b] ?? 0}</span>
            </p>
          </React.Fragment>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">아직 없음</p>
      ) : (
        <ul className="space-y-1.5 border-t border-slate-100 pt-3">
          {rows.map((r) => (
            <li key={r.type} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{r.type}</span>
              <span className="tabular-nums text-slate-900">{r.n}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
