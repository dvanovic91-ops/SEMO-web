import React, { useEffect, useMemo, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';
import {
  CATEGORY_OPTIONS,
  type PendingMatchedItem,
  type PendingRow,
  categoryLabel,
  collectPhotos,
  matchStats,
} from './types';

type Props = {
  onError: (message: string) => void;
};

export const PendingApprovals: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_pending_submissions', {
      p_status: 'pending',
    });
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    const list = (data ?? []) as PendingRow[];
    setRows(list);
    setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="overflow-y-auto rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">대기 {rows.length}</p>
          <button
            type="button"
            onClick={load}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            새로고침
          </button>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-sm text-slate-400">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">대기 중인 제보가 없습니다.</p>
        ) : (
          <ul>
            {rows.map((row) => {
              const stats = matchStats(row);
              const active = row.id === selectedId;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={`w-full border-b border-slate-100 px-4 py-3 text-left ${
                      active ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className="truncate text-sm font-medium">
                      {row.extracted_brand || '브랜드 없음'}
                    </p>
                    <p className={`truncate text-xs ${active ? 'text-white/70' : 'text-slate-500'}`}>
                      {row.extracted_name || row.extracted_name_translation || '이름 없음'}
                    </p>
                    <p className={`mt-1 text-[11px] ${active ? 'text-white/60' : 'text-slate-400'}`}>
                      매칭 {stats.matched} · 미매칭 {stats.unmatched}
                      {row.brand_known ? '' : ' · 신규브랜드'}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <section className="min-w-0">
        {selected ? (
          <PendingDetail
            key={selected.id}
            row={selected}
            busy={busy}
            setBusy={setBusy}
            onError={onError}
            onDone={load}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-400">
            왼쪽에서 제보를 고르세요.
          </div>
        )}
      </section>
    </div>
  );
};

function PendingDetail({
  row,
  busy,
  setBusy,
  onError,
  onDone,
}: {
  row: PendingRow;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onError: (message: string) => void;
  onDone: () => void;
}) {
  const photos = useMemo(() => collectPhotos(row), [row]);
  const stats = useMemo(() => matchStats(row), [row]);
  const items = row.matched_ingredients ?? [];

  const [photoIdx, setPhotoIdx] = useState(0);
  const [nameEn, setNameEn] = useState(
    (row.extracted_name_translation || row.extracted_name || '').trim(),
  );
  const [nameKr, setNameKr] = useState((row.extracted_name || '').trim());
  const [brand, setBrand] = useState((row.extracted_brand || '').trim());
  const [category, setCategory] = useState(row.extracted_category || '');
  const [nameEnConfirmed, setNameEnConfirmed] = useState(true);
  const [allowNewBrand, setAllowNewBrand] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const brandLooksNew = !row.brand_known;
  const canApprove =
    nameEn.trim().length > 0 &&
    brand.trim().length > 0 &&
    (!brandLooksNew || allowNewBrand);

  async function reject() {
    if (!window.confirm('이 제보를 거절할까요?')) return;
    setBusy(true);
    const { error } = await deepkorSupabase.rpc('admin_reject_pending_submission', {
      p_submission_id: row.id,
    });
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    onDone();
  }

  async function approve() {
    if (!canApprove) return;
    setBusy(true);
    try {
      if (brandLooksNew) {
        const { error: brandError } = await deepkorSupabase.rpc('admin_register_brand_if_missing', {
          p_name: brand.trim(),
        });
        if (brandError) throw brandError;
      }
      const nameEnValue = nameEn.trim();
      const nameKrValue = nameKr.trim() || nameEnValue;
      const { error } = await deepkorSupabase.rpc('admin_approve_pending_submission', {
        p_submission_id: row.id,
        p_name_kr: nameKrValue,
        p_name_en: nameEnValue,
        p_brand: brand.trim(),
        p_ingredients_raw: row.extracted_ingredients_raw ?? '',
        p_matched_ingredients: row.matched_ingredients ?? [],
        p_category: category || null,
        p_name_en_source: nameEnConfirmed ? 'confirmed' : 'ai_translation',
        p_unlisted_proposals: row.unlisted_ingredient_proposals ?? [],
      });
      if (error) throw error;
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setConfirmApprove(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {photos.length > 0 ? (
          <div className="relative bg-slate-100">
            <img
              src={photos[photoIdx]}
              alt=""
              className="mx-auto max-h-[420px] w-full object-contain"
            />
            {photos.length > 1 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
                {photos.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPhotoIdx(i)}
                    className={`h-2 w-2 rounded-full ${i === photoIdx ? 'bg-white' : 'bg-white/40'}`}
                    aria-label={`사진 ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-slate-400">사진 없음</p>
        )}
      </div>

      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2">
        <Field label="영문명">
          <input
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="한글명 (없으면 영문명과 동일)">
          <input
            value={nameKr}
            onChange={(e) => setNameKr(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="브랜드">
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </Field>
        <Field label="카테고리">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">미분류</option>
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm">
        <div className="flex flex-wrap gap-2">
          <Pill>
            매칭 {stats.matched} / 미매칭 {stats.unmatched}
          </Pill>
          {stats.unlisted > 0 && <Pill tone="amber">미등록 제안 {stats.unlisted}</Pill>}
          <Pill>{categoryLabel(row.extracted_category)}</Pill>
          {row.brand_known ? <Pill tone="green">기존 브랜드</Pill> : <Pill tone="amber">신규 브랜드</Pill>}
          {row.ingredients_source && <Pill>{row.ingredients_source}</Pill>}
          {row.submission_type && row.submission_type !== 'new_product' && (
            <Pill>{row.submission_type}</Pill>
          )}
        </div>
        {row.web_search_source_url && (
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <p>
              전성분은 그 몰을 우리가 스크래핑한 게 아닙니다. 구글 검색이
              <span className="font-medium text-slate-700"> 실제로 인용한 페이지</span>
              를 출처로 붙입니다. 인용이 없거나 주소가 안 열리면 출처를 믿지 마세요.
            </p>
            {row.web_search_source_description && (
              <p className="text-slate-600">{row.web_search_source_description}</p>
            )}
            <a
              href={row.web_search_source_url}
              target="_blank"
              rel="noreferrer"
              className="block break-all underline"
            >
              {row.web_search_source_url}
            </a>
          </div>
        )}
        {brandLooksNew && (
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={allowNewBrand}
              onChange={(e) => setAllowNewBrand(e.target.checked)}
              className="mt-1"
            />
            신규 브랜드입니다. 로고 없이 brands에 등록하고 승인합니다. (로고는 나중에 봇/카탈로그에서
            채워도 됩니다)
          </label>
        )}
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={nameEnConfirmed}
            onChange={(e) => setNameEnConfirmed(e.target.checked)}
            className="mt-1"
          />
          영문명을 확인했다 (끄면 AI 번역으로 표시)
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="mb-3 text-sm font-medium text-slate-800">전성분</p>
        <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
          {items.length === 0 ? (
            <li className="text-slate-400">성분 데이터 없음</li>
          ) : (
            items.map((item, i) => <IngredientLine key={`${item.raw ?? i}-${i}`} item={item} index={i} />)
          )}
        </ul>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={reject}
          className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
        >
          거절
        </button>
        {!confirmApprove ? (
          <button
            type="button"
            disabled={busy || !canApprove}
            onClick={() => setConfirmApprove(true)}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            승인 준비
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !canApprove}
            onClick={approve}
            className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? '처리 중…' : '라이브 제품으로 승인'}
          </button>
        )}
      </div>
      {confirmApprove && (
        <p className="text-right text-xs text-amber-700">
          한 번 더 누르면 카탈로그에 실제 제품이 생깁니다.
        </p>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function Pill({
  children,
  tone = 'slate',
}: {
  children: React.ReactNode;
  tone?: 'slate' | 'amber' | 'green';
}) {
  const cls =
    tone === 'amber'
      ? 'bg-amber-50 text-amber-800'
      : tone === 'green'
        ? 'bg-emerald-50 text-emerald-800'
        : 'bg-slate-100 text-slate-700';
  return <span className={`rounded-full px-2.5 py-1 text-xs ${cls}`}>{children}</span>;
}

function IngredientLine({ item, index }: { item: PendingMatchedItem; index: number }) {
  const ok = item.matched === true;
  return (
    <li className="flex gap-2">
      <span className="w-6 shrink-0 text-right text-xs text-slate-400">{index + 1}</span>
      <span className={ok ? 'text-slate-800' : 'text-amber-800'}>
        {item.name_en || item.raw || '(empty)'}
        {!ok && <span className="ml-2 text-[11px] uppercase tracking-wide">미매칭</span>}
      </span>
    </li>
  );
}
