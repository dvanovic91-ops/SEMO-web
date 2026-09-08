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

type Props = {
  onError: (message: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function tmpId(prefix: string) {
  return `tmp-${prefix}-${crypto.randomUUID()}`;
}

function isTmp(id: string) {
  return id.startsWith('tmp-');
}

function snapshotOf(sections: Section[], cards: Card[]) {
  return JSON.stringify({ sections, cards });
}

export const HomeCmsPanel: React.FC<Props> = ({ onError, onDirtyChange }) => {
  const [sections, setSections] = useState<Section[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [baseline, setBaseline] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [removedSectionIds, setRemovedSectionIds] = useState<string[]>([]);
  const [removedCardIds, setRemovedCardIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [previewLang, setPreviewLang] = useState<'en' | 'ru'>('en');

  const dirty = snapshotOf(sections, cards) !== baseline;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

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
    const cardList = (card.data ?? []) as Card[];
    setSections(list);
    setCards(cardList);
    setBaseline(snapshotOf(list, cardList));
    setRemovedSectionIds([]);
    setRemovedCardIds([]);
    setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : list[0]?.id ?? null));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patchSection(id: string, patch: Partial<Section>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function patchCard(id: string, patch: Partial<Card>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function moveSection(id: string, dir: -1 | 1) {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy.map((s, i) => ({ ...s, sort_order: i }));
    });
  }

  function moveCard(id: string, dir: -1 | 1) {
    if (!selectedId) return;
    setCards((prev) => {
      const group = prev.filter((c) => c.section_id === selectedId).sort((a, b) => a.sort_order - b.sort_order);
      const rest = prev.filter((c) => c.section_id !== selectedId);
      const idx = group.findIndex((c) => c.id === id);
      const next = idx + dir;
      if (idx < 0 || next < 0 || next >= group.length) return prev;
      [group[idx], group[next]] = [group[next], group[idx]];
      return [...rest, ...group.map((c, i) => ({ ...c, sort_order: i }))];
    });
  }

  function addSection(kind: 'recommended' | 'carousel') {
    const id = tmpId('section');
    const section: Section = {
      id,
      kind,
      sort_order: sections.length,
      title_en: kind === 'recommended' ? 'For you' : 'Discover',
      title_ru: kind === 'recommended' ? 'Для вас' : 'Подборка',
      visible: true,
      card_height: kind === 'recommended' ? 128 : 220,
      card_width: kind === 'recommended' ? 128 : null,
    };
    setSections((prev) => [...prev, section]);
    setSelectedId(id);
  }

  function deleteSection(id: string) {
    if (!window.confirm('이 섹션을 삭제할까요? 저장해야 앱에 반영됩니다.')) return;
    if (!isTmp(id)) setRemovedSectionIds((prev) => [...prev, id]);
    const goneCards = cards.filter((c) => c.section_id === id);
    setRemovedCardIds((prev) => [...prev, ...goneCards.filter((c) => !isTmp(c.id)).map((c) => c.id)]);
    setCards((prev) => prev.filter((c) => c.section_id !== id));
    setSections((prev) => prev.filter((s) => s.id !== id).map((s, i) => ({ ...s, sort_order: i })));
    setSelectedId((prev) => (prev === id ? null : prev));
  }

  function addCard() {
    if (!selected) return;
    const card: Card = {
      id: tmpId('card'),
      section_id: selected.id,
      sort_order: selectedCards.length,
      title_en: 'New card',
      title_ru: 'Новая карточка',
      subtitle_en: '',
      subtitle_ru: '',
      image_url: null,
      link_url: null,
      visible: true,
    };
    setCards((prev) => [...prev, card]);
  }

  function deleteCard(id: string) {
    if (!isTmp(id)) setRemovedCardIds((prev) => [...prev, id]);
    setCards((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      const group = remaining.filter((c) => c.section_id === selectedId).map((c, i) => ({ ...c, sort_order: i }));
      const rest = remaining.filter((c) => c.section_id !== selectedId);
      return [...rest, ...group];
    });
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
    patchCard(card.id, { image_url: data.publicUrl });
  }

  async function saveAll() {
    setBusy(true);
    try {
      const idMap = new Map<string, string>();

      for (const section of sections) {
        if (!isTmp(section.id)) {
          idMap.set(section.id, section.id);
          continue;
        }
        const { data, error } = await deepkorSupabase.rpc('admin_add_home_section', { p_kind: section.kind });
        if (error) throw error;
        idMap.set(section.id, data as string);
      }

      const mappedSections = sections.map((s, i) => ({
        ...s,
        id: idMap.get(s.id) ?? s.id,
        sort_order: i,
      }));

      const mappedCards = cards.map((c) => ({
        ...c,
        section_id: idMap.get(c.section_id) ?? c.section_id,
      }));

      for (const id of removedCardIds) {
        const { error } = await deepkorSupabase.rpc('admin_delete_home_card', { p_id: id });
        if (error) throw error;
      }
      for (const id of removedSectionIds) {
        const { error } = await deepkorSupabase.rpc('admin_delete_home_section', { p_id: id });
        if (error) throw error;
      }

      for (const section of mappedSections) {
        const { error } = await deepkorSupabase.rpc('admin_save_home_section', {
          p_id: section.id,
          p_title_en: section.title_en,
          p_title_ru: section.title_ru,
          p_visible: section.visible,
          p_card_height: section.card_height,
          p_card_width: section.card_width,
        });
        if (error) throw error;
      }

      const { error: reorderSecError } = await deepkorSupabase.rpc('admin_reorder_home_sections', {
        p_ids: mappedSections.map((s) => s.id),
      });
      if (reorderSecError) throw reorderSecError;

      const cardIdMap = new Map<string, string>();
      for (const card of mappedCards) {
        const { data, error } = await deepkorSupabase.rpc('admin_upsert_home_card', {
          p_section_id: card.section_id,
          p_title_en: card.title_en,
          p_title_ru: card.title_ru,
          p_subtitle_en: card.subtitle_en,
          p_subtitle_ru: card.subtitle_ru,
          p_image_url: card.image_url,
          p_link_url: card.link_url,
          p_visible: card.visible,
          p_id: isTmp(card.id) ? null : card.id,
        });
        if (error) throw error;
        cardIdMap.set(card.id, (data as string) ?? card.id);
      }

      for (const section of mappedSections) {
        const ids = mappedCards
          .filter((c) => c.section_id === section.id)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((c) => cardIdMap.get(c.id) ?? c.id);
        if (ids.length === 0) continue;
        const { error } = await deepkorSupabase.rpc('admin_reorder_home_cards', { p_ids: ids });
        if (error) throw error;
      }

      await load();
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2000);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!window.confirm('저장하지 않은 변경을 버릴까요?')) return;
    await load();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-900">홈 화면 편집</p>
          <p className="text-xs text-slate-500">
            {dirty ? '아직 앱에 반영되지 않았습니다. 저장을 눌러야 유저에게 보입니다.' : '저장된 상태와 같습니다.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={discard}
            className="rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-40"
          >
            되돌리기
          </button>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={saveAll}
            className="rounded-full bg-slate-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy ? '저장 중…' : savedFlash ? '저장됨' : '앱에 저장'}
          </button>
        </div>
      </div>

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
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">섹션 설정</p>
                  <button type="button" className="text-xs text-red-600" onClick={() => deleteSection(selected.id)}>
                    삭제
                  </button>
                </div>
                <Field label="영문 제목">
                  <input
                    value={selected.title_en}
                    onChange={(e) => patchSection(selected.id, { title_en: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </Field>
                <Field label="러시아어 제목">
                  <input
                    value={selected.title_ru}
                    onChange={(e) => patchSection(selected.id, { title_ru: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </Field>
                <Field
                  label={
                    selected.kind === 'carousel'
                      ? `배너 높이 ${selected.card_height}px (사진 + 제목)`
                      : `상품 카드 높이 ${selected.card_height}px`
                  }
                >
                  <input
                    type="range"
                    min={120}
                    max={420}
                    value={selected.card_height}
                    onChange={(e) => patchSection(selected.id, { card_height: Number(e.target.value) })}
                    className="w-full"
                  />
                </Field>
                {selected.kind === 'recommended' && (
                  <Field label={`카드 너비 ${selected.card_width ?? 128}px`}>
                    <input
                      type="range"
                      min={96}
                      max={220}
                      value={selected.card_width ?? 128}
                      onChange={(e) => patchSection(selected.id, { card_width: Number(e.target.value) })}
                      className="w-full"
                    />
                  </Field>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.visible}
                    onChange={(e) => patchSection(selected.id, { visible: e.target.checked })}
                  />
                  앱에 보이기
                </label>
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
                    <article key={card.id} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
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
                      <div className="overflow-hidden rounded-lg border border-slate-100">
                        {card.image_url ? (
                          <img src={card.image_url} alt="" className="h-28 w-full object-cover" />
                        ) : (
                          <div className="flex h-20 items-center justify-center bg-slate-100 text-[11px] text-slate-400">
                            사진 없음
                          </div>
                        )}
                        <div className="bg-slate-50 px-2 py-1.5">
                          <p className="truncate text-xs font-semibold text-slate-900">
                            {card.title_en || card.title_ru || '제목 없음'}
                          </p>
                          <p className="truncate text-[11px] text-slate-500">
                            {card.subtitle_en || card.subtitle_ru || '태그 없음'}
                          </p>
                        </div>
                      </div>
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
                        value={card.title_en}
                        placeholder="영문 제목"
                        onChange={(e) => patchCard(card.id, { title_en: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={card.title_ru}
                        placeholder="러시아어 제목"
                        onChange={(e) => patchCard(card.id, { title_ru: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={card.subtitle_en}
                        placeholder="영문 태그"
                        onChange={(e) => patchCard(card.id, { subtitle_en: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={card.subtitle_ru}
                        placeholder="러시아어 태그"
                        onChange={(e) => patchCard(card.id, { subtitle_ru: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <input
                        value={card.link_url ?? ''}
                        placeholder="탭하면 열 링크 (https://… 또는 product:UUID)"
                        onChange={(e) => patchCard(card.id, { link_url: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={card.visible}
                          onChange={(e) => patchCard(card.id, { visible: e.target.checked })}
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
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] text-slate-400">{dirty ? '미리보기 (미저장)' : '앱 미리보기'}</p>
              <div className="flex overflow-hidden rounded-full border border-slate-200 text-[10px]">
                <button
                  type="button"
                  className={`px-2 py-0.5 ${previewLang === 'en' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                  onClick={() => setPreviewLang('en')}
                >
                  EN
                </button>
                <button
                  type="button"
                  className={`px-2 py-0.5 ${previewLang === 'ru' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
                  onClick={() => setPreviewLang('ru')}
                >
                  RU
                </button>
              </div>
            </div>
            <div className="max-h-[640px] space-y-4 overflow-y-auto pr-1">
              {sections
                .filter((s) => s.visible)
                .map((s) => {
                  const sectionTitle = previewLang === 'ru' ? s.title_ru : s.title_en;
                  const firstCard = cards.find((c) => c.section_id === s.id && c.visible);
                  return (
                    <div key={s.id}>
                      <p className="mb-1.5 text-[12px] font-semibold text-slate-900">{sectionTitle}</p>
                      {s.kind === 'recommended' ? (
                        <div className="flex gap-2 overflow-hidden">
                          {[0, 1].map((i) => (
                            <div
                              key={i}
                              className="shrink-0 rounded-[10px] border border-slate-200 bg-white"
                              style={{
                                width: (s.card_width ?? 128) * PREVIEW_SCALE,
                                height: s.card_height * PREVIEW_SCALE,
                              }}
                            />
                          ))}
                        </div>
                      ) : (
                        <PhoneBannerCard card={firstCard} lang={previewLang} height={s.card_height} />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </aside>
      </div>
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

/** 앱 홈 카드와 비슷한 비율. 미리보기 폰 폭이 실제보다 작아서 0.82로 맞춤. */
const PREVIEW_SCALE = 0.82;

function PhoneBannerCard({
  card,
  lang,
  height,
}: {
  card: Card | undefined;
  lang: 'en' | 'ru';
  height: number;
}) {
  const title = card ? (lang === 'ru' ? card.title_ru : card.title_en) : '';
  const subtitle = card ? (lang === 'ru' ? card.subtitle_ru : card.subtitle_en) : '';
  return (
    <div
      className="flex flex-col rounded-[14px] border border-slate-200 bg-white p-2.5"
      style={{ height: height * PREVIEW_SCALE }}
    >
      <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] bg-slate-100">
        {card?.image_url ? (
          <img src={card.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-slate-400">배너</div>
        )}
      </div>
      <p className="mt-2 truncate text-[11px] font-semibold leading-tight text-slate-900">{title || ' '}</p>
      <p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{subtitle || ' '}</p>
    </div>
  );
}
