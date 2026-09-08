import React, { useEffect, useMemo, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

type Member = {
  user_id: string;
  email: string | null;
  is_anonymous: boolean;
  provider: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  nickname: string | null;
  baumann_type: string | null;
  device_country: string | null;
  app_locale: string | null;
  scan_count: number | string;
  submission_count: number | string;
};

type MemberDetail = Member & {
  skin_concerns: string[] | null;
  avoided_ingredient_keys: string[] | null;
  sensitivity_subtypes: string[] | null;
};

type Props = { onError: (message: string) => void };

export const MembersPanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'guest' | 'signed'>('all');
  const [skinFilter, setSkinFilter] = useState<string | 'unset' | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemberDetail | null>(null);

  const skinStats = useMemo(() => {
    const counts = new Map<string, number>();
    let unset = 0;
    for (const row of rows) {
      const t = row.baumann_type?.trim();
      if (!t) {
        unset += 1;
        continue;
      }
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const types = [...counts.entries()]
      .map(([type, n]) => ({ type, n }))
      .sort((a, b) => b.n - a.n || a.type.localeCompare(b.type));
    return { types, unset, set: rows.length - unset };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === 'guest' && !r.is_anonymous) return false;
      if (filter === 'signed' && r.is_anonymous) return false;
      if (skinFilter === 'unset') return !r.baumann_type;
      if (skinFilter) return r.baumann_type === skinFilter;
      return true;
    });
  }, [rows, filter, skinFilter]);

  const signed = rows.filter((r) => !r.is_anonymous).length;

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_members');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as Member[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await deepkorSupabase.rpc('admin_get_member', { p_user_id: selectedId });
      if (cancelled) return;
      if (error) {
        onError(error.message);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setDetail((row as MemberDetail) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, onError]);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_320px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">
            계정 {rows.length} · 로그인 {signed} · 게스트 {rows.length - signed}
          </p>
          <div className="flex gap-1">
            {(
              [
                ['all', '전체'],
                ['signed', '로그인'],
                ['guest', '게스트'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  filter === id ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-3">
          <SkinChip
            label={`설정 ${skinStats.set}`}
            active={skinFilter === null}
            onClick={() => setSkinFilter(null)}
          />
          <SkinChip
            label={`미설정 ${skinStats.unset}`}
            active={skinFilter === 'unset'}
            onClick={() => setSkinFilter(skinFilter === 'unset' ? null : 'unset')}
          />
          {skinStats.types.map((s) => (
            <SkinChip
              key={s.type}
              label={`${s.type} ${s.n}`}
              active={skinFilter === s.type}
              onClick={() => setSkinFilter(skinFilter === s.type ? null : s.type)}
            />
          ))}
        </div>
        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">계정</th>
                  <th className="px-4 py-2 font-medium">타입</th>
                  <th className="px-4 py-2 font-medium">피부</th>
                  <th className="px-4 py-2 font-medium">국적</th>
                  <th className="px-4 py-2 font-medium">스캔</th>
                  <th className="px-4 py-2 font-medium">가입</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.user_id}
                    onClick={() => setSelectedId(row.user_id)}
                    className={`cursor-pointer border-t border-slate-100 ${
                      selectedId === row.user_id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-2">
                      <p className="truncate font-medium">{row.nickname || row.email || '게스트'}</p>
                      {row.email && <p className="truncate text-xs opacity-70">{row.email}</p>}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {row.is_anonymous ? '게스트' : row.provider || '로그인'}
                    </td>
                    <td className="px-4 py-2 text-xs">{row.baumann_type || '—'}</td>
                    <td className="px-4 py-2 text-xs">{row.device_country || '—'}</td>
                    <td className="px-4 py-2 text-xs">{row.scan_count}</td>
                    <td className="px-4 py-2 text-xs">{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        {!detail ? (
          <p className="text-slate-400">왼쪽에서 회원을 고르세요.</p>
        ) : (
          <Stack>
            <p className="text-base font-medium text-slate-900">{detail.nickname || detail.email || '게스트'}</p>
            <Meta label="이메일" value={detail.email || '없음 (게스트)'} />
            <Meta label="로그인" value={detail.is_anonymous ? '익명 게스트' : detail.provider || '—'} />
            <Meta label="피부타입" value={detail.baumann_type || '미설정'} />
            <Meta label="기기 지역" value={detail.device_country || '아직 없음'} />
            <Meta label="앱 언어" value={detail.app_locale || '아직 없음'} />
            <Meta label="스캔 / 제보" value={`${detail.scan_count} / ${detail.submission_count}`} />
            <Meta label="가입" value={formatDate(detail.created_at)} />
            <Meta label="최근 접속" value={detail.last_sign_in_at ? formatDate(detail.last_sign_in_at) : '—'} />
            <Meta label="피부고민" value={(detail.skin_concerns ?? []).join(', ') || '—'} />
            <Meta label="민감 아형" value={(detail.sensitivity_subtypes ?? []).join(', ') || '—'} />
            <Meta
              label="회피성분"
              value={
                (detail.avoided_ingredient_keys ?? []).length
                  ? `${(detail.avoided_ingredient_keys ?? []).length}개`
                  : '—'
              }
            />
          </Stack>
        )}
      </aside>
    </div>
  );
};

function Stack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-slate-800">{value}</p>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SkinChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[11px] ${
        active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}
