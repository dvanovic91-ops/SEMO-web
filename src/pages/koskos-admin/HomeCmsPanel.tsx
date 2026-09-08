import React, { useEffect, useMemo, useState } from 'react';
import { deepkorSupabase } from '../../lib/deepkorSupabase';

type Section = {
  id: string;
  kind: 'recommended' | 'carousel';
  sort_order: number;
  title_en: string;
  title_ru: string;
  visible: boolean;
  card_height: number;
  card_width: number | null;
};

type Card = {
  id: string;
  section_id: string;
  sort_order: number;
  title_en: string;
  title_ru: string;
  subtitle_en: string;
  subtitle_ru: string;
  image_url: string | null;
  link_url: string | null;
  visible: boolean;
};

type Props = { onError: (message: string) => void };

export const HomeCmsPanel: React.FC<Props> = ({ onError }) => {
  const [sections, setSections] = useState<Section[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const selectedCards = useMemo(
    () => cards.filter((c) => c.section_id === selectedId).sort((a, b) => a.sort_order - b.sort_order),
    [cards, selectedId],
  );

  async function load() {
    const [sec, card] = await Promise.all([
      deepkorSupabase.from('home_sections').select('*').order('sort_order'),
      deepkorSupabase.from('home_cards').select('*').order('sort_order'),
    ]);
    if (sec.error) {
      onError(sec.error.message);
      return;
    }
    if (card.error) {
      onError(card.error.message);
      return;
    }
    const list = (sec.data ?? []) as Section[];
    setSections(list);
    setCards((card.data ?? []) as Card[]);
    setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? null));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function moveSection(id: string, dir: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    const { error } = await deepkorSupabase.rpc('admin_reorder_home_sections', { p_ids: ids });
    if (error) onError(error.message);
    else load();
  }

  async function saveSection(patch: Partial<Section>) {
    if (!selected) return;
    setBusy(true);
    const { error } = await deepkorSupabase.rpc('admin_save_home_section', {
      p_id: selected.id,
      p_title_en: patch.title_en ?? selected.title_en,
      p_title_ru: patch.title_ru ?? selected.title_ru,
      p_visible: patch.visible ?? selected.visible,
      p_card_height: patch.card_height ?? selected.card_height,
      p_card_width: patch.card_width === undefined ? selected.card_width : patch.card_width,
    });
    setBusy(false);
    if (error) onError(error.message);
    else load();
  }

  async function addSection(kind: 'recommended' | 'carousel') {
    const { error } = await deepkorSupabase.rpc('admin_add_home_section', { p_kind: kind });
    if (error) onError(error.message);
    else load();
  }

  async function deleteSection(id: string) {
    if (!window.confirm('이 섹션을 삭제할까요?')) return;
    const { error } = await deepkorSupabase.rpc('admin_delete_home_section', { p_id: id });
    if (error) onError(error.message);
    else load();
  }

  async function moveCard(id: string, dir: -1 | 1) {
    const idx = selectedCards.findIndex((c) => c.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= selectedCards.length) return;
    const ids = selectedCards.map((c) => c.id);
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    const { error } = await deepkorSupabase.rpc('admin_reorder_home_cards', { p_ids: ids });
    if (error) onError(error.message);
    else load();
  }

  async function saveCard(card: Card, extra: Partial<Card> = {}) {
    const next = { ...card, ...extra };
    const { error } = await deepkorSupabase.rpc('admin_upsert_home_card', {
      p_section_id: next.section_id,
      p_title_en: next.title_en,
      p_title_ru: next.title_ru,
      p_subtitle_en: next.subtitle_en,
      p_subtitle_ru: next.subtitle_ru,
      p_image_url: next.image_url,
      p_link_url: next.link_url,
      p_visible: next.visible,
      p_id: next.id,
    });
    if (error) onError(error.message);
    else load();
  }

  async function addCard() {
    if (!selected) return;
    const { error } = await deepkorSupabase.rpc('admin_upsert_home_card', {
      p_section_id: selected.id,
      p_title_en: 'New card',
      p_title_ru: 'Новая карточка',
      p_subtitle_en: '',
      p_subtitle_ru: '',
      p_image_url: null,
      p_link_url: null,
      p_visible: true,
      p_id: null,
    });
    if (error) onError(error.message);
    else load();
  }

  async function deleteCard(id: string) {
    const { error } = await deepkorSupabase.rpc('admin_delete_home_card', { p_id: id });
    if (error) onError(error.message);
    else load();
  }

  async function uploadCardImage(card: Card, file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${card.section_id}/${Date.now()}.${ext}`;
    const { error } = await deepkorSupabase.storage.from('home-cms').upload(path, file, { upsert: true });
    if (error) {
      onError(error.message);
      return;
    }
    const { data } = deepkorSupabase.storage.from('home-cms').getPublicUrl(path);
    await saveCard(card, { image_url: data.publicUrl });
  }

  return (
    <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_1fr_340px]">
      <aside className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-medium">섹션 순서</p>
          <div className="flex gap-2">
            <button type="button" className="text-xs text-slate-500" onClick={() => addSection('carousel')}>
              +배너
            </button>
            <button type="button" className="text-xs text-slate-500" onClick={() => addSection('recommended')}>
              +추천
            </button>
          </div>
        </div>
        <ul>
          {sections.map((s) => (
            <li key={s.id} className={`border-b border-slate-100 ${selectedId === s.id ? 'bg-slate-900 text-white' : ''}`}>
              <div className="flex items-center gap-1 px-2 py-2">
                <div className="flex flex-col">
                  <button type="button" className="px-1 text-[10px] opacity-70" onClick={() => moveSection(s.id, -1)}>
                    ▲
                  </button>
                  <button type="button" className="px-1 text-[10px] opacity-70" onClick={() => moveSection(s.id, 1)}>
                    ▼
                  </button>
                </div>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(s.id)}>
                  <p className="truncate text-sm font-medium">{s.title_en || s.kind}</p>
                  <p className="text-[11px] opacity-70">
                    {s.kind === 'recommended' ? '추천 상품' : '배너 캐러셀'}
                    {s.visible ? '' : ' · 숨김'}
                  </p>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 space-y-4">
        {!selected ? (
          <p className="text-sm text-slate-400">섹션을 고르세요.</p>
        ) : (
          <>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">섹션 설정</p>
                <button type="button" className="text-xs text-red-600" onClick={() => deleteSection(selected.id)}>
                  삭제
                </button>
              </div>
              <Field label="영문 제목">
                <input
                  defaultValue={selected.title_en}
                  key={`${selected.id}-en`}
                  onBlur={(e) => saveSection({ title_en: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label="러시아어 제목">
                <input
                  defaultValue={selected.title_ru}
                  key={`${selected.id}-ru`}
                  onBlur={(e) => saveSection({ title_ru: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
              </Field>
              <Field label={`카드 높이 ${selected.card_height}px`}>
                <input
                  type="range"
                  min={100}
                  max={360}
                  defaultValue={selected.card_height}
                  key={`${selected.id}-h-${selected.card_height}`}
                  onPointerUp={(e) => saveSection({ card_height: Number((e.target as HTMLInputElement).value) })}
                  className="w-full"
                />
              </Field>
              {selected.kind === 'recommended' && (
                <Field label={`카드 너비 ${selected.card_width ?? 128}px`}>
                  <input
                    type="range"
                    min={96}
                    max={220}
                    defaultValue={selected.card_width ?? 128}
                    key={`${selected.id}-w-${selected.card_width}`}
                    onPointerUp={(e) => saveSection({ card_width: Number((e.target as HTMLInputElement).value) })}
                    className="w-full"
                  />
                </Field>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.visible}
                  onChange={(e) => saveSection({ visible: e.target.checked })}
                />
                앱에 보이기
              </label>
              {busy && <p className="text-xs text-slate-400">저장 중…</p>}
            </div>

            {selected.kind === 'carousel' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">배너 카드 (좌우 순서)</p>
                  <button type="button" className="text-xs text-slate-600" onClick={addCard}>
                    + 카드
                  </button>
                </div>
                {selectedCards.map((card, i) => (
                  <article key={card.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">카드 {i + 1}</p>
                      <div className="flex gap-2">
                        <button type="button" className="text-xs" onClick={() => moveCard(card.id, -1)}>
                          ←
                        </button>
                        <button type="button" className="text-xs" onClick={() => moveCard(card.id, 1)}>
                          →
                        </button>
                        <button type="button" className="text-xs text-red-600" onClick={() => deleteCard(card.id)}>
                          삭제
                        </button>
                      </div>
                    </div>
                    {card.image_url && (
                      <img src={card.image_url} alt="" className="h-28 w-full rounded-lg object-cover" />
                    )}
                    <label className="block text-xs text-slate-500">
                      사진 업로드
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-1 block text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadCardImage(card, file);
                        }}
                      />
                    </label>
                    <input
                      defaultValue={card.title_en}
                      key={`${card.id}-ten`}
                      placeholder="영문 제목"
                      onBlur={(e) => saveCard(card, { title_en: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      defaultValue={card.title_ru}
                      key={`${card.id}-tru`}
                      placeholder="러시아어 제목"
                      onBlur={(e) => saveCard(card, { title_ru: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      defaultValue={card.subtitle_en}
                      key={`${card.id}-sen`}
                      placeholder="영문 태그"
                      onBlur={(e) => saveCard(card, { subtitle_en: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      defaultValue={card.subtitle_ru}
                      key={`${card.id}-sru`}
                      placeholder="러시아어 태그"
                      onBlur={(e) => saveCard(card, { subtitle_ru: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      defaultValue={card.link_url ?? ''}
                      key={`${card.id}-url`}
                      placeholder="탭하면 열 링크 (https://… 또는 product:UUID)"
                      onBlur={(e) => saveCard(card, { link_url: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={card.visible}
                        onChange={(e) => saveCard(card, { visible: e.target.checked })}
                      />
                      보이기
                    </label>
                  </article>
                ))}
              </div>
            )}
            {selected.kind === 'recommended' && (
              <p className="text-sm text-slate-500">
                이 줄의 상품은 피부타입 추천 알고리즘이 채웁니다. 여기서는 위치·제목·카드 크기만 바꿉니다.
              </p>
            )}
          </>
        )}
      </section>

      <aside className="hidden xl:block">
        <div className="sticky top-4 mx-auto w-[300px] rounded-[2rem] border-[10px] border-slate-900 bg-slate-50 p-3">
          <p className="mb-2 text-center text-[10px] text-slate-400">앱 미리보기</p>
          <div className="space-y-3">
            {sections
              .filter((s) => s.visible)
              .map((s) => (
                <div key={s.id}>
                  <p className="mb-1 text-[11px] font-medium">{s.title_en}</p>
                  {s.kind === 'recommended' ? (
                    <div className="flex gap-2 overflow-hidden">
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="shrink-0 rounded-lg border border-slate-200 bg-white"
                          style={{ width: (s.card_width ?? 128) / 2, height: s.card_height / 2 }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                      style={{ height: s.card_height / 2 }}
                    >
                      {cards.find((c) => c.section_id === s.id && c.visible)?.image_url ? (
                        <img
                          src={cards.find((c) => c.section_id === s.id && c.visible)!.image_url!}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-400">배너</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}
