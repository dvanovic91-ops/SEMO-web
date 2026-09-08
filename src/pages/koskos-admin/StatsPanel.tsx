import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

type NamedCount = { n: number; provider?: string; type?: string; name?: string; brand?: string | null; locale?: string; country?: string; query?: string; reason?: string };

type Dashboard = {
  timezone: string;
  today_date: string;
  today: {
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
    scans: number;
    scans_matched: number;
    scans_unmatched: number;
    product_views: number;
    submissions: number;
  };
  week: { scans: number; product_views: number; new_accounts: number; searches: number; sessions: number };
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
  };
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

  if (loading && !data) {
    return <p className="text-sm text-slate-400">불러오는 중…</p>;
  }
  if (!data) {
    return <p className="text-sm text-slate-400">통계를 불러오지 못했습니다.</p>;
  }

  const t = data.today;
  const f = data.funnel_today;
  const r = data.retention;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">오늘 {data.today_date}</p>
          <p className="text-xs text-slate-500">
            기준 시간 {data.timezone} · 세션/검색/스캔 실패는 새 앱 버전부터 쌓입니다. 지역은 기기
            국가코드이지 여권 국적이 아닙니다.
          </p>
        </div>
        <button type="button" onClick={load} className="text-xs text-slate-500 hover:text-slate-800">
          새로고침
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="오늘 이용자" value={t.active_users} hint={`게스트 ${t.active_guests} · 로그인 ${t.active_signed_in}`} />
        <StatCard label="오늘 세션" value={t.sessions} />
        <StatCard label="오늘 검색" value={t.searches} />
        <StatCard label="오늘 제품 열람" value={t.product_opens} hint={`최근본 갱신 ${t.product_views}`} />
        <StatCard label="오늘 신규" value={t.new_accounts} hint={`게스트 ${t.new_guests} · 로그인 ${t.new_signed_in}`} />
        <StatCard label="오늘 스캔 시작" value={t.scan_start} />
        <StatCard label="오늘 스캔 매칭" value={t.scan_match} />
        <StatCard label="오늘 배너 클릭" value={t.banner_clicks} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-slate-800">오늘 스캔 퍼널</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <StatCard label="시작" value={f.scan_start} />
          <StatCard label="매칭 성공" value={f.scan_match} hint={pct(f.scan_match, f.scan_start)} />
          <StatCard label="실패/제보" value={f.scan_fail} hint={pct(f.scan_fail, f.scan_start)} />
          <StatCard label="제품 상세" value={f.product_open} />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
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

      <section className="grid gap-3 sm:grid-cols-3">
        <StatCard label="7일 신규" value={data.week.new_accounts} />
        <StatCard label="7일 세션" value={data.week.sessions} />
        <StatCard label="7일 검색" value={data.week.searches} />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 계정" value={data.totals.accounts} hint={`게스트 ${data.totals.guests} · 로그인 ${data.totals.signed_in}`} />
        <StatCard label="피부타입 설정" value={data.totals.with_skin_type} />
        <StatCard label="즐겨찾기" value={data.totals.favorites} />
        <StatCard label="리뷰 / 승인대기 제보" value={`${data.totals.reviews} / ${data.totals.pending_open}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title="앱 언어" rows={(data.locales ?? []).map((p) => ({ k: p.locale ?? '—', n: p.n }))} />
        <ListCard title="기기 국가" rows={(data.countries ?? []).map((p) => ({ k: p.country ?? '—', n: p.n }))} />
        <ListCard title="로그인 수단" rows={data.providers.map((p) => ({ k: p.provider ?? '—', n: p.n }))} />
        <ListCard title="바우만 피부타입" rows={data.baumann.map((p) => ({ k: p.type ?? '—', n: p.n }))} />
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

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ListCard({ title, rows }: { title: string; rows: { k: string; n: number }[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="mb-3 text-sm font-medium text-slate-800">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">아직 없음</p>
      ) : (
        <ul className="space-y-2">
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
