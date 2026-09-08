import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

type ScanRow = {
  scanned_at: string;
  user_id: string | null;
  nickname: string | null;
  is_anonymous: boolean;
  product_id: string | null;
  product_name: string | null;
  brand: string | null;
  pending_submission_id: string | null;
  pending_name: string | null;
  pending_brand: string | null;
};

type Props = { onError: (message: string) => void };

export const ScansPanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_scans');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as ScanRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="text-sm font-medium text-slate-800">최근 스캔 {rows.length}</p>
        <button type="button" onClick={load} className="text-xs text-slate-500 hover:text-slate-800">
          새로고침
        </button>
      </div>
      {loading ? (
        <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-slate-400">스캔 기록이 없습니다.</p>
      ) : (
        <div className="max-h-[75vh] overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">시각</th>
                <th className="px-4 py-2 font-medium">유저</th>
                <th className="px-4 py-2 font-medium">제품</th>
                <th className="px-4 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const name = row.product_name || row.pending_name || '이름 없음';
                const brand = row.brand || row.pending_brand || '';
                const pending = Boolean(row.pending_submission_id && !row.product_id);
                return (
                  <tr key={`${row.scanned_at}-${row.user_id ?? i}`} className="border-t border-slate-100">
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                      {new Date(row.scanned_at).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-2">
                      {row.nickname || (row.is_anonymous ? '게스트' : '유저')}
                    </td>
                    <td className="px-4 py-2">
                      <p className="font-medium text-slate-900">{brand ? `${brand} · ${name}` : name}</p>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {pending ? (
                        <span className="text-amber-700">제보 대기</span>
                      ) : (
                        <span className="text-slate-500">매칭됨</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
