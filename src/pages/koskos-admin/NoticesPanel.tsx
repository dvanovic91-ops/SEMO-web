import React, { useEffect, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

type Notice = {
  id: string;
  title_en: string;
  title_ru: string;
  body_en: string | null;
  body_ru: string | null;
  category: string;
  is_active: boolean;
  target_user_id: string | null;
  target_email: string | null;
  created_at: string;
};

type Props = { onError: (message: string) => void };

const EMPTY = {
  title_en: '',
  title_ru: '',
  body_en: '',
  body_ru: '',
  category: 'general',
  target_email: '',
  is_active: true,
};

export const NoticesPanel: React.FC<Props> = ({ onError }) => {
  const [rows, setRows] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  async function load() {
    setLoading(true);
    const { data, error } = await deepkorSupabase.rpc('admin_list_notifications');
    setLoading(false);
    if (error) {
      onError(error.message);
      return;
    }
    setRows((data ?? []) as Notice[]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(row: Notice) {
    if (row.category === 'correction_result') return;
    setEditingId(row.id);
    setForm({
      title_en: row.title_en,
      title_ru: row.title_ru,
      body_en: row.body_en ?? '',
      body_ru: row.body_ru ?? '',
      category: row.category,
      target_email: row.target_email ?? '',
      is_active: row.is_active,
    });
  }

  function startNew() {
    setEditingId(null);
    setForm(EMPTY);
  }

  async function save() {
    setBusy(true);
    const { error } = await deepkorSupabase.rpc('admin_upsert_notification', {
      p_title_en: form.title_en,
      p_title_ru: form.title_ru,
      p_body_en: form.body_en,
      p_body_ru: form.body_ru,
      p_category: form.category,
      p_is_active: form.is_active,
      p_target_email: form.target_email.trim() || null,
      p_id: editingId,
    });
    setBusy(false);
    if (error) {
      onError(error.message);
      return;
    }
    setForm(EMPTY);
    setEditingId(null);
    load();
  }

  async function toggleActive(row: Notice) {
    const { error } = await deepkorSupabase.rpc('admin_set_notification_active', {
      p_id: row.id,
      p_is_active: !row.is_active,
    });
    if (error) {
      onError(error.message);
      return;
    }
    load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">공지 {rows.length}</p>
          <button type="button" onClick={startNew} className="text-xs text-slate-500 hover:text-slate-800">
            새로 작성
          </button>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-sm text-slate-400">불러오는 중…</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-400">아직 공지가 없습니다. 오른쪽에서 작성하세요.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((row) => (
              <li key={row.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => startEdit(row)} className="min-w-0 text-left">
                    <p className="truncate text-sm font-medium text-slate-900">{row.title_en}</p>
                    <p className="truncate text-xs text-slate-500">{row.title_ru}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {row.category}
                      {row.target_email ? ` · ${row.target_email}` : ' · 전체'}
                      {row.is_active ? '' : ' · 숨김'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(row)}
                    className="shrink-0 text-xs text-slate-500 hover:text-slate-800"
                  >
                    {row.is_active ? '숨기기' : '보이기'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <p className="text-sm font-medium text-slate-800">{editingId ? '공지 수정' : '새 공지'}</p>
        <p className="text-xs text-slate-500">앱 홈 종모양에 뜹니다. 영문과 러시아어를 같이 넣으세요.</p>
        <label className="block text-xs font-medium text-slate-500">
          영문 제목
          <input
            required
            value={form.title_en}
            onChange={(e) => setForm({ ...form, title_en: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          러시아어 제목
          <input
            required
            value={form.title_ru}
            onChange={(e) => setForm({ ...form, title_ru: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          영문 본문
          <textarea
            value={form.body_en}
            onChange={(e) => setForm({ ...form, body_en: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          러시아어 본문
          <textarea
            value={form.body_ru}
            onChange={(e) => setForm({ ...form, body_ru: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          종류
          <select
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="general">일반</option>
            <option value="update">업데이트</option>
            <option value="promo">프로모</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">
          특정 유저 이메일 (비우면 전체)
          <input
            type="email"
            value={form.target_email}
            onChange={(e) => setForm({ ...form, target_email: e.target.value })}
            placeholder="비우면 모든 유저에게"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          바로 보이게
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? '저장 중…' : editingId ? '수정 저장' : '게시'}
        </button>
      </form>
    </div>
  );
};
