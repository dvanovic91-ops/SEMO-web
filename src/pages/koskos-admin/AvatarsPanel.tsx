import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

/**
 * 프로필 사진 관리(2026-11-25). 회원이 직접 올린 프로필 사진을 모아 보고, 부적절하면 내린다.
 * 내리기 = admin_remove_avatar RPC(avatar_url 비우고 파일 이름 돌려줌) → Storage API로 파일 삭제
 * (Deepkor 마이그레이션 20261125040000). 내리면 앱에는 그 회원의 기본 그림이 보인다.
 */
type AvatarRow = {
  user_id: string;
  nickname: string | null;
  avatar_url: string;
  profile_public: boolean;
  updated_at: string | null;
};

type Props = { onError: (message: string) => void };

export const AvatarsPanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<AvatarRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_avatars');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as AvatarRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(row: AvatarRow) {
    if (!window.confirm(`${row.nickname || '이 회원'}의 프로필 사진을 내릴까요? 파일도 지워지고 되돌릴 수 없어요.`)) return;
    setBusyId(row.user_id);
    const { data, error } = await deepkorSupabase.rpc('admin_remove_avatar', { p_user_id: row.user_id });
    if (error) {
      setBusyId(null);
      onError(error.message);
      return;
    }
    const names = (data ?? []) as string[];
    if (names.length) {
      const { error: storageError } = await deepkorSupabase.storage.from('avatars').remove(names);
      if (storageError) onError(`사진 주소는 지웠지만 파일 삭제 실패: ${storageError.message}`);
    }
    setBusyId(null);
    setRows((prev) => prev.filter((r) => r.user_id !== row.user_id));
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-medium text-slate-800">직접 올린 프로필 사진 {rows.length}개</p>
        <button type="button" onClick={load} className="rounded-full px-3 py-1 text-xs text-slate-500 hover:bg-slate-100">
          새로고침
        </button>
      </div>
      <p className="px-4 pt-3 text-[11px] text-slate-400">
        공개 프로필인 회원의 사진만 다른 사람에게 보입니다. 내리면 기본 그림으로 바뀝니다.
      </p>
      {loading ? (
        <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-slate-400">올린 사진이 없습니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 lg:grid-cols-6">
          {rows.map((row) => (
            <div key={row.user_id} className="rounded-xl border border-slate-100 p-3 text-center">
              <img
                src={row.avatar_url}
                alt=""
                className="mx-auto h-24 w-24 rounded-full bg-slate-100 object-cover"
                loading="lazy"
              />
              <p className="mt-2 truncate text-xs font-medium text-slate-800">{row.nickname || '—'}</p>
              <p className="text-[11px] text-slate-400">
                {row.profile_public ? '공개' : '비공개'}
                {row.updated_at ? ` · ${formatDate(row.updated_at)}` : ''}
              </p>
              <button
                type="button"
                disabled={busyId === row.user_id}
                onClick={() => remove(row)}
                className="mt-2 w-full rounded-full border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {busyId === row.user_id ? '내리는 중…' : '내리기'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
