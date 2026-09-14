import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';
import { categoryLabel } from './types';

/**
 * 스캔 SPF 확인. 유저가 선케어를 스캔하면 recognize-product가 용기의 SPF/PA를 읽어
 * sun_spf_observations에 남긴다. 스캔 1건이면 바로 제품에 넣지 않고 'pending'으로 두고,
 * 서로 다른 유저 2명이 같은 값을 읽거나 관리자가 반영해야 채운다(Deepkor 20260915230000).
 * 목록·반영/거절은 admin_list_sun_spf_scan_queue / admin_review_sun_spf_observation RPC
 * (20260915300000). 반영은 제품 SPF가 비어 있을 때만 채운다 — 이미 값이 있으면 덮지 않는다.
 */
type OtherObservation = {
  id: string;
  source: string;
  status: string;
  value: string | null;
  same_value: boolean;
  source_url: string | null;
  created_at: string;
};

type QueueRow = {
  observation_id: string;
  product_id: string;
  brand: string | null;
  name_en: string | null;
  name_kr: string | null;
  category: string | null;
  image_url: string | null;
  scan_spf_value: number;
  scan_spf_plus: boolean;
  scan_pa_rating: string | null;
  scan_value: string | null;
  current_value: string | null;
  current_source: string | null;
  raw_text: string | null;
  read_brand: string | null;
  read_product_name: string | null;
  scanner_nickname: string | null;
  scanner_is_anonymous: boolean | null;
  scan_history_id: string | null;
  scan_photo_url: string | null;
  created_at: string;
  agreeing_users: number;
  conflicting_pending: number;
  other_observations: OtherObservation[] | null;
};

type Props = { onError: (message: string) => void };

const SOURCE_LABELS: Record<string, string> = {
  name: '제품명',
  manual: '수동 입력',
  catalog: '공식몰',
  scan: '스캔',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '확인 대기',
  applied: '반영됨',
  skipped_existing: '기존 값 있어 안 채움',
  not_sun_care: '선케어 아님',
  rejected: '거절',
  submitted: '제보 대기',
  unattached: '미연결',
};

function resultMessage(result: string): string {
  if (result.startsWith('applied')) {
    const extra = result.match(/\+(\d+)/);
    return extra ? `반영했습니다. 같은 값으로 대기 중이던 스캔 ${extra[1]}건도 함께 닫았습니다.` : '반영했습니다.';
  }
  switch (result) {
    case 'rejected':
      return '거절했습니다.';
    case 'skipped_existing':
      return '제품에 이미 SPF 값이 있어 채우지 않았습니다. 기록은 불일치 경보용으로 남습니다.';
    case 'not_sun_care':
      return '선케어 제품이 아니라 채우지 않았습니다.';
    case 'not_found':
    case 'not_found_or_resolved':
      return '이미 처리된 건입니다.';
    default:
      return `처리 결과: ${result}`;
  }
}

function productLabel(row: QueueRow): string {
  return [row.brand, row.name_en || row.name_kr].filter(Boolean).join(' · ') || '이름 없음';
}

export const SunSpfQueuePanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_sun_spf_scan_queue');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as QueueRow[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function review(row: QueueRow, action: 'apply' | 'reject') {
    const label = productLabel(row);
    const scan = row.scan_value || '읽은 값';
    const question =
      action === 'apply'
        ? row.current_value
          ? `"${label}"에는 이미 ${row.current_value}가 있어서 반영해도 덮어쓰지 않습니다(기록만 남음). 진행할까요?`
          : `"${label}"에 ${scan}을(를) 반영할까요?`
        : `"${label}"의 스캔 값 ${scan}을(를) 거절할까요?`;
    if (!window.confirm(question)) return;

    setBusyId(row.observation_id);
    setNotice(null);
    const { data, error } = await deepkorSupabase.rpc('admin_review_sun_spf_observation', {
      p_id: row.observation_id,
      p_action: action,
    });
    setBusyId(null);
    if (error) {
      onError(error.message);
      return;
    }
    setNotice(`${label} — ${resultMessage(String(data ?? ''))}`);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">스캔 SPF 확인 대기 {rows.length}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              유저 스캔이 용기에서 읽은 SPF/PA입니다. 반영하면 제품 SPF가 비어 있을 때만 채웁니다(출처: 스캔).
              서로 다른 유저 2명이 같은 값을 읽으면 여기 오지 않고 자동으로 채워집니다.
            </p>
          </div>
          <button type="button" onClick={load} className="shrink-0 text-xs text-slate-500 hover:text-slate-800">
            새로고침
          </button>
        </div>

        {notice && (
          <div className="flex items-start justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            <span>{notice}</span>
            <button type="button" className="shrink-0 text-xs underline" onClick={() => setNotice(null)}>
              닫기
            </button>
          </div>
        )}

        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-400">확인할 스캔 SPF가 없습니다.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <QueueCard
                key={row.observation_id}
                row={row}
                busy={busyId === row.observation_id}
                disabled={busyId !== null}
                onReview={review}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

function QueueCard({
  row,
  busy,
  disabled,
  onReview,
}: {
  row: QueueRow;
  busy: boolean;
  disabled: boolean;
  onReview: (row: QueueRow, action: 'apply' | 'reject') => void;
}) {
  const others = row.other_observations ?? [];
  const readName = [row.read_brand, row.read_product_name].filter(Boolean).join(' · ');
  const scanner = row.scanner_nickname || (row.scanner_is_anonymous === null ? '비로그인' : row.scanner_is_anonymous ? '게스트' : '유저');

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
      <div className="flex shrink-0 gap-2">
        <Photo url={row.image_url} caption="제품" />
        <Photo url={row.scan_photo_url} caption="스캔 사진" emptyText="사진 없음" />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate text-xs text-slate-500">
          {row.brand || '브랜드 없음'} · {categoryLabel(row.category)}
        </p>
        <p className="text-sm font-medium text-slate-900">{row.name_en || row.name_kr || '이름 없음'}</p>
        {row.name_en && row.name_kr && row.name_kr !== row.name_en && (
          <p className="truncate text-xs text-slate-400">{row.name_kr}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <span className={row.current_value ? 'text-slate-700' : 'text-slate-400'}>
            {row.current_value || '비어 있음'}
            {row.current_source && (
              <span className="ml-1 text-xs text-slate-400">({SOURCE_LABELS[row.current_source] ?? row.current_source})</span>
            )}
          </span>
          <span className="text-slate-400">→</span>
          <span className="rounded-md bg-slate-900 px-2 py-0.5 font-semibold text-white">{row.scan_value || '값 없음'}</span>
        </div>
        {row.current_value && (
          <p className="text-xs text-amber-700">제품에 이미 값이 있어 반영해도 덮어쓰지 않습니다.</p>
        )}

        {row.raw_text && (
          <p className="text-xs text-slate-600">
            용기에서 읽은 글자: <span className="font-mono">{row.raw_text}</span>
          </p>
        )}
        {readName && <p className="text-xs text-slate-600">사진에서 읽은 제품: {readName}</p>}

        <p className="text-xs">
          <span className="text-slate-600">같은 값 대기 {row.agreeing_users}명</span>
          {row.conflicting_pending > 0 && (
            <span className="ml-2 text-amber-700">다른 값 대기 {row.conflicting_pending}건</span>
          )}
        </p>

        {others.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {others.map((o) => {
              const chip = (
                <>
                  {SOURCE_LABELS[o.source] ?? o.source} {o.value || '값 없음'} · {STATUS_LABELS[o.status] ?? o.status}
                </>
              );
              const cls = `rounded-full border px-2 py-0.5 text-[11px] ${
                o.same_value ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
              }`;
              return o.source_url ? (
                <a key={o.id} href={o.source_url} target="_blank" rel="noreferrer" className={`${cls} hover:underline`}>
                  {chip}
                </a>
              ) : (
                <span key={o.id} className={cls}>
                  {chip}
                </span>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-400">
          {new Date(row.created_at).toLocaleString('ko-KR')} · {scanner}
        </p>
      </div>

      <div className="flex shrink-0 gap-2 sm:flex-col">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onReview(row, 'apply')}
          className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {busy ? '처리 중…' : '반영'}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onReview(row, 'reject')}
          className="rounded-full border border-slate-300 px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          거절
        </button>
      </div>
    </li>
  );
}

function Photo({ url, caption, emptyText }: { url: string | null; caption: string; emptyText?: string }) {
  return (
    <div className="w-20 text-center">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={caption} className="h-20 w-20 rounded-lg bg-slate-100 object-contain" loading="lazy" />
        </a>
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">
          {emptyText ?? ''}
        </div>
      )}
      <p className="mt-0.5 text-[10px] text-slate-400">{caption}</p>
    </div>
  );
}
