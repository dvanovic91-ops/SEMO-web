import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BOX_BUILDER_ADMIN_SLOTS,
  BOX_SLOT_LABELS,
  type BoxSlotKey,
} from '../../lib/buildBoxCatalog';
import {
  buildPiProfileFromDraft,
  formatCommaList,
  type PiProfile,
} from '../../lib/piProfile';
import { formatSkinApiNetworkError, getSkinApiBaseUrl, skinApiHeaders } from '../../lib/skinApiBaseUrl';
import { SkuBulkImport } from './SkuBulkImport';
import { SkuAddModal } from './SkuAddModal';
import { SkuImageUploadField } from '../../components/SkuImageUploadField';

type IngredientJson = {
  name?: string;
  position?: number;
  benefit_tags?: string[];
};

type SkuPickerRow = {
  id: string;
  brand: string | null;
  name: string;
  display_name: string | null;
  name_en: string | null;
  description_ru: string | null;
  image_url: string | null;
  volume_label: string | null;
  box_builder_slot: BoxSlotKey | null;
  box_builder_sort_order: number;
  box_builder_tag_ru: string | null;
  box_builder_tag_en: string | null;
  baumann_types: string[] | null;
  baumann_recommend_reason_ru: string | null;
  texture_feel: string | null;
  pi_profile: PiProfile | null;
  is_active: boolean;
  ingredients_json: IngredientJson[] | null;
};

// 글리세린·BG 등 한국 스킨케어 기재 보습제 — 모든 제품에 pos2-4 고정으로 들어가
// hydrating 점수 계산 시 제외해야 제품 간 실질 차이가 보임
const BASE_HUMECTANTS = new Set([
  'glycerin', 'butylene glycol', 'propanediol',
  '1,2-hexanediol', 'dipropylene glycol', 'pentylene glycol',
  'sorbitol', 'caprylyl glycol',
]);

// 카테고리별 소비자 기대 효능 5축
const SLOT_AXES: Partial<Record<BoxSlotKey, Array<{ key: string; label: string; color: string }>>> = {
  cleanser: [
    // 클렌저는 워시오프 → 수분축 임상적으로 무의미, 대신 클렌징 목적 효능으로 구성
    { key: 'soothing', label: '진정·저자극', color: '#10B981' },
    { key: 'barrier', label: '장벽케어', color: '#14B8A6' },
    { key: 'brightening', label: '미백·광채', color: '#EAB308' },
    { key: 'exfoliating', label: '피부결', color: '#F59E0B' },
    { key: 'acne', label: '항균', color: '#059669' },
  ],
  toner: [
    { key: 'hydrating', label: '수분', color: '#3B82F6' },
    { key: 'soothing', label: '진정', color: '#10B981' },
    { key: 'exfoliating', label: '각질케어', color: '#F59E0B' },
    { key: 'brightening', label: '미백·광채', color: '#EAB308' },
    { key: 'barrier', label: '장벽케어', color: '#14B8A6' },
  ],
  serum: [
    { key: 'brightening', label: '미백·광채', color: '#EAB308' },
    { key: 'anti_aging', label: '안티에이징', color: '#8B5CF6' },
    { key: 'soothing', label: '진정', color: '#10B981' },
    { key: 'hydrating', label: '수분', color: '#3B82F6' },
    { key: 'antioxidant', label: '항산화', color: '#F43F5E' },
  ],
  ampoule: [
    { key: 'anti_aging', label: '안티에이징', color: '#8B5CF6' },
    { key: 'antioxidant', label: '항산화', color: '#F43F5E' },
    { key: 'firming', label: '탄력', color: '#6366F1' },
    { key: 'soothing', label: '진정', color: '#10B981' },
    { key: 'hydrating', label: '수분', color: '#3B82F6' },
  ],
  cream: [
    { key: 'hydrating', label: '수분', color: '#3B82F6' },
    { key: 'barrier', label: '장벽케어', color: '#14B8A6' },
    { key: 'anti_aging', label: '안티에이징', color: '#8B5CF6' },
    { key: 'firming', label: '탄력', color: '#6366F1' },
    { key: 'soothing', label: '진정', color: '#10B981' },
  ],
  sunscreen: [
    { key: 'uv_protection', label: 'UV보호', color: '#F97316' },
    { key: 'hydrating', label: '수분', color: '#3B82F6' },
    { key: 'soothing', label: '진정', color: '#10B981' },
    { key: 'antioxidant', label: '항산화', color: '#F43F5E' },
    { key: 'brightening', label: '미백·광채', color: '#EAB308' },
  ],
  premium: [
    { key: 'soothing', label: '진정', color: '#10B981' },
    { key: 'barrier', label: '장벽케어', color: '#14B8A6' },
    { key: 'anti_aging', label: '안티에이징', color: '#8B5CF6' },
    { key: 'hydrating', label: '수분', color: '#3B82F6' },
    { key: 'antioxidant', label: '항산화', color: '#F43F5E' },
  ],
};

function calcIngScore(ings: IngredientJson[], tagKey: string): number {
  const sorted = [...ings]
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
    .slice(0, 15);
  let raw = 0;
  for (const ing of sorted) {
    if (!Array.isArray(ing.benefit_tags) || !ing.benefit_tags.includes(tagKey)) continue;
    // hydrating 계산 시 기재 보습제(글리세린·BG 등) 제외 — 이들은 모든 제품에 고농도로 들어가
    // '제품이 수분을 위해 설계됐는가'를 보려면 히어로 보습 성분만 카운트해야 함
    if (tagKey === 'hydrating') {
      const nameNorm = (ing.name ?? '').toLowerCase().trim();
      if (BASE_HUMECTANTS.has(nameNorm)) continue;
    }
    raw += 1 / Math.log2((ing.position ?? 15) + 1);
  }
  return Math.min(5, raw * 2);
}

const VALID_BAUMANN_CODES = new Set([
  'DSNT', 'DSNW', 'DSPT', 'DSPW', 'DRNT', 'DRNW', 'DRPT', 'DRPW',
  'OSNT', 'OSNW', 'OSPT', 'OSPW', 'ORNT', 'ORNW', 'ORPT', 'ORPW',
]);

function parseBaumannTypesInput(raw: string): string[] {
  const parts = raw
    .split(/[\s,;/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (VALID_BAUMANN_CODES.has(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

function formatBaumannTypes(codes: string[] | null | undefined): string {
  return (codes ?? []).join(', ');
}

type SkuEditDraft = {
  id: string;
  brand: string;
  name: string;
  display_name: string;
  volume_label: string;
  image_url: string;
  box_builder_tag_ru: string;
  box_builder_tag_en: string;
  baumann_types_text: string;
  video_says_for_text: string;
  avoid_for_text: string;
  texture_feel: string;
  why_ko: string;
  tier: string;
  key_ingredients_text: string;
  marketing_badge: 'youtuber_pick' | 'retail_top' | '';
  is_active: boolean;
};

function piDraftFromSku(sku: SkuPickerRow): Pick<
  SkuEditDraft,
  'video_says_for_text' | 'avoid_for_text' | 'texture_feel' | 'why_ko' | 'tier' | 'key_ingredients_text' | 'marketing_badge'
> {
  const pi = sku.pi_profile;
  return {
    video_says_for_text: formatCommaList(pi?.video_says_for),
    avoid_for_text: formatCommaList(pi?.avoid_for),
    texture_feel: pi?.texture_feel?.trim() || sku.texture_feel?.trim() || '',
    why_ko: pi?.why_ko?.trim() || '',
    tier: pi?.tier?.trim() || '',
    key_ingredients_text: formatCommaList(pi?.key_ingredients),
    marketing_badge: (pi?.marketing_badge as SkuEditDraft['marketing_badge']) || '',
  };
}

function SkuQuickEditModal({
  sku,
  onClose,
  onSaved,
}: {
  sku: SkuPickerRow;
  onClose: () => void;
  onSaved: (updated: Partial<SkuPickerRow>) => void;
}) {
  const [draft, setDraft] = React.useState<SkuEditDraft>({
    id: sku.id,
    brand: sku.brand ?? '',
    name: sku.name,
    display_name: sku.display_name ?? '',
    volume_label: sku.volume_label ?? '',
    image_url: sku.image_url ?? '',
    box_builder_tag_ru: sku.box_builder_tag_ru ?? '',
    box_builder_tag_en: sku.box_builder_tag_en ?? '',
    baumann_types_text: formatBaumannTypes(sku.baumann_types),
    ...piDraftFromSku(sku),
    is_active: sku.is_active,
  });
  const [saving, setSaving] = React.useState(false);
  const [computing, setComputing] = React.useState(false);
  const [computeMsg, setComputeMsg] = React.useState('');
  const [err, setErr] = React.useState('');
  const skinApiUrl = getSkinApiBaseUrl();

  const isPremium = sku.box_builder_slot === 'premium';
  const parsedBaumann = parseBaumannTypesInput(draft.baumann_types_text);
  const baumannInputInvalid =
    !isPremium && draft.baumann_types_text.trim().length > 0 && parsedBaumann.length === 0;

  const field = (
    label: string,
    key: keyof Omit<SkuEditDraft, 'id' | 'is_active'>,
    placeholder = '',
  ) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <input
        value={draft[key] as string}
        onChange={(e) => setDraft((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
      />
    </div>
  );

  const handleSave = async () => {
    if (!supabase) return;
    if (baumannInputInvalid) {
      setErr('바우만 타입: DSNT, DSPW 등 16종 코드만 입력 (쉼표 구분)');
      return;
    }
    setSaving(true);
    setErr('');
    const baumann_types = isPremium ? null : (parsedBaumann.length > 0 ? parsedBaumann : null);
    const pi_base = buildPiProfileFromDraft(draft) ?? {};
    const marketing_badge_val = draft.marketing_badge || null;
    const pi_profile = {
      ...(sku.pi_profile ?? {}),
      ...pi_base,
      ...(sku.pi_profile?.badges ? { badges: sku.pi_profile.badges } : {}),
      ...(sku.pi_profile?.feature_tags_ko ? { feature_tags_ko: sku.pi_profile.feature_tags_ko } : {}),
      ...(marketing_badge_val ? { marketing_badge: marketing_badge_val as 'youtuber_pick' | 'retail_top' } : { marketing_badge: null }),
    };
    const payload = {
      brand: draft.brand.trim() || null,
      name: draft.name.trim(),
      display_name: draft.display_name.trim() || null,
      volume_label: draft.volume_label.trim() || null,
      image_url: draft.image_url.trim() || null,
      box_builder_tag_ru: draft.box_builder_tag_ru.trim(),
      box_builder_tag_en: draft.box_builder_tag_en.trim(),
      baumann_types,
      pi_profile: Object.keys(pi_profile).length > 0 ? pi_profile : null,
      texture_feel: draft.texture_feel.trim() || null,
      is_active: draft.is_active,
    };
    const { error } = await supabase.from('sku_items').update(payload).eq('id', sku.id);
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(payload);
    onClose();
  };

  const handleRecomputePremiumTags = async () => {
    if (!supabase) return;
    setComputing(true);
    setComputeMsg('');
    setErr('');
    try {
      const res = await fetch(`${skinApiUrl}/recompute-premium-tags`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({ sku_id: sku.id }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        box_builder_tag_ru?: string;
        box_builder_tag_en?: string;
        feature_tags_ko?: string[];
        error?: string;
      };
      if (!res.ok || !data.success) {
        setErr(data.error || `태그 생성 실패 (HTTP ${res.status})`);
        return;
      }
      setDraft((p) => ({
        ...p,
        box_builder_tag_ru: data.box_builder_tag_ru ?? p.box_builder_tag_ru,
        box_builder_tag_en: data.box_builder_tag_en ?? p.box_builder_tag_en,
        baumann_types_text: '',
      }));
      const ko = (data.feature_tags_ko ?? []).join(', ');
      setComputeMsg(`태그 생성됨${ko ? `: ${ko}` : ''}`);
      onSaved({
        box_builder_tag_ru: data.box_builder_tag_ru,
        box_builder_tag_en: data.box_builder_tag_en,
        baumann_types: null,
        pi_profile: data.feature_tags_ko?.length
          ? { ...(sku.pi_profile ?? {}), feature_tags_ko: data.feature_tags_ko }
          : sku.pi_profile,
      });
    } catch (e) {
      setErr(formatSkinApiNetworkError(e, skinApiUrl));
    } finally {
      setComputing(false);
    }
  };

  const handleRecomputeBaumann = async () => {
    if (!supabase) return;
    setComputing(true);
    setComputeMsg('');
    setErr('');
    const pi_profile = buildPiProfileFromDraft(draft);
    if (!pi_profile) {
      setErr('파i 적합/피하/촉감 중 하나 이상 입력 후 계산하세요.');
      setComputing(false);
      return;
    }
    try {
      const { error: saveErr } = await supabase
        .from('sku_items')
        .update({
          pi_profile,
          texture_feel: draft.texture_feel.trim() || null,
        })
        .eq('id', sku.id);
      if (saveErr) {
        setErr(saveErr.message);
        return;
      }
      onSaved({ pi_profile, texture_feel: draft.texture_feel.trim() || null });

      const res = await fetch(`${skinApiUrl}/recompute-baumann`, {
        method: 'POST',
        headers: skinApiHeaders,
        body: JSON.stringify({ sku_id: sku.id }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        baumann_types?: string[];
        error?: string;
        notes?: string[];
        warnings?: string[];
      };
      if (!res.ok || !data.success) {
        setErr(data.error || `재계산 실패 (HTTP ${res.status})`);
        return;
      }
      const codes = data.baumann_types ?? [];
      setDraft((p) => ({ ...p, baumann_types_text: formatBaumannTypes(codes) }));
      const note = [...(data.notes ?? []), ...(data.warnings ?? [])].join(' · ');
      setComputeMsg(`계산됨: ${codes.join(', ')}${note ? ` (${note})` : ''}`);
      onSaved({ baumann_types: codes.length ? codes : null });
    } catch (e) {
      setErr(formatSkinApiNetworkError(e, skinApiUrl));
    } finally {
      setComputing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 shrink-0">
          <h3 className="font-semibold text-slate-800">SKU 빠른 편집</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="overflow-y-auto px-6 py-4 space-y-3">
          {field('브랜드', 'brand', 'S\'NATURE')}
          {field('공식 영문명 (name)', 'name', 'Tea Tree Cica Deep Cleansing Foam')}
          {field('표시명 (한국어)', 'display_name', '에스네이처 클렌저')}
          {field('용량', 'volume_label', '150ml')}
          <SkuImageUploadField
            value={draft.image_url}
            onChange={(url) => setDraft((p) => ({ ...p, image_url: url }))}
            disabled={saving}
          />
          {field('태그 RU', 'box_builder_tag_ru', 'Мягкое очищение · Все типы')}
          {field('태그 EN', 'box_builder_tag_en', 'Gentle · All skin types')}

          {/* 마케팅 배지 */}
          <div className="rounded-lg border border-slate-200 p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">마케팅 배지</p>
            {([
              ['', '없음'],
              ['youtuber_pick', '한국 100만 유튜버 추천'],
              ['retail_top', '한국 리테일 판매 1위 (초록)'],
            ] as const).map(([val, label]) => (
              <label key={val} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="marketing_badge"
                  value={val}
                  checked={draft.marketing_badge === val}
                  onChange={() => setDraft((p) => ({ ...p, marketing_badge: val as SkuEditDraft['marketing_badge'] }))}
                  className="accent-brand"
                />
                <span className={`text-xs ${val === 'retail_top' ? 'text-green-600 font-medium' : 'text-slate-700'}`}>{label}</span>
              </label>
            ))}
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              파i 큐레이션 (NotebookLM)
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">적합 피부 (쉼표)</label>
              <input
                value={draft.video_says_for_text}
                onChange={(e) => setDraft((p) => ({ ...p, video_says_for_text: e.target.value }))}
                placeholder="지성, 모공, 미백"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">피하 피부 (쉼표) — S 유저 👑 제외</label>
              <input
                value={draft.avoid_for_text}
                onChange={(e) => setDraft((p) => ({ ...p, avoid_for_text: e.target.value }))}
                placeholder="민감, 아토피"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            {field('촉감', 'texture_feel', '가벼움, 빠른 흡수')}
            {field('tier', 'tier', 'top_of_top_2025, past_top, a_grade')}
            {field('핵심 성분 (쉼표)', 'key_ingredients_text', 'PDRN, 시카, 판테올')}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">왜 추천 (KO, 메모)</label>
              <textarea
                value={draft.why_ko}
                onChange={(e) => setDraft((p) => ({ ...p, why_ko: e.target.value }))}
                rows={2}
                placeholder="파i 영상 요약 한 줄"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={() => void (isPremium ? handleRecomputePremiumTags() : handleRecomputeBaumann())}
              disabled={computing || saving}
              className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {computing
                ? '생성 중…'
                : isPremium
                  ? '히어로 성분 → 효능 태그 생성 (AI)'
                  : '파i+성분 → 바우만 타입 계산'}
            </button>
            {computeMsg && <p className="text-[10px] text-emerald-700">{computeMsg}</p>}
          </div>

          {!isPremium && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-violet-600">
              👑 적합 바우만 타입 (수동 · 쉼표 구분)
            </label>
            <input
              value={draft.baumann_types_text}
              onChange={(e) => setDraft((p) => ({ ...p, baumann_types_text: e.target.value }))}
              placeholder="DSPW, DSNW 또는 OSPW, ORPT"
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-violet-400 ${
                baumannInputInvalid ? 'border-red-300 bg-red-50' : 'border-violet-200 bg-white'
              }`}
            />
            {parsedBaumann.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {parsedBaumann.map((code) => (
                  <span key={code} className="rounded-md bg-violet-200 px-2 py-0.5 text-[10px] font-bold text-violet-800">
                    {code}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-[10px] text-slate-500">
              16종: DSNT DSNW DSPT DSPW DRNT DRNW DRPT DRPW OSNT OSNW OSPT OSPW ORNT ORNW ORPT ORPW
            </p>
            {sku.baumann_recommend_reason_ru && (
              <p className="mt-2 text-[10px] leading-snug text-slate-600">
                <span className="font-medium text-slate-500">RU 추천 문구: </span>
                {sku.baumann_recommend_reason_ru}
              </p>
            )}
          </div>
          )}

          {isPremium && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <p className="text-[10px] text-amber-800">
                프리미엄은 <strong>히어로 성분 · 효능</strong> 태그만 표시 (바우만 타입 없음).
                예: 「Пантенол · Восстановление барьера」
              </p>
              {sku.pi_profile?.feature_tags_ko?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {sku.pi_profile.feature_tags_ko.map((t) => (
                    <span key={t} className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-900">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active_edit"
              checked={draft.is_active}
              onChange={(e) => setDraft((p) => ({ ...p, is_active: e.target.checked }))}
              className="h-4 w-4 accent-brand"
            />
            <label htmlFor="is_active_edit" className="text-sm text-slate-700">활성화</label>
          </div>
        </div>

        <div className="shrink-0 border-t border-slate-100 px-6 py-4">
          {err && <p className="mb-3 text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
              취소
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || baumannInputInvalid}
              className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IngredientProfileChart({
  slot,
  ings,
  expanded,
  onToggle,
}: {
  slot: BoxSlotKey | null;
  ings: IngredientJson[] | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const axes = slot ? SLOT_AXES[slot] : null;
  if (!axes) return null;
  const hasData = ings && ings.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center border-t border-slate-100 px-3 py-1 text-left text-[10px] text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      >
        <span className="flex-1 font-medium">성분 강점 분석</span>
        <span className="text-[9px]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="space-y-1.5 px-3 pb-3 pt-2 bg-white/60">
          {!hasData && (
            <p className="text-[10px] text-slate-400">성분 데이터 없음</p>
          )}
          {hasData && axes.map(({ key, label, color }) => {
            const score = calcIngScore(ings, key);
            const pct = Math.round((score / 5) * 100);
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-right text-[10px] text-slate-500 leading-tight">{label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: color }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right text-[9px] tabular-nums text-slate-400">
                  {score.toFixed(1)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SLOT_MAX: Record<BoxSlotKey, number> = {
  cleanser: 6,
  toner: 6,
  serum: 6,
  ampoule: 6,
  cream: 6,
  sunscreen: 6,
  premium: 2,
};

function skuLabel(row: SkuPickerRow): string {
  const brand = row.brand?.trim();
  const name = row.display_name?.trim() || row.name?.trim() || row.id.slice(0, 8);
  return brand ? `${brand} · ${name}` : name;
}

export function BuildBoxTab() {
  const [allSkus, setAllSkus] = useState<SkuPickerRow[]>([]);
  const [assignments, setAssignments] = useState<Record<BoxSlotKey, string[]>>(() =>
    Object.fromEntries(BOX_BUILDER_ADMIN_SLOTS.map((s) => [s, []])) as Record<BoxSlotKey, string[]>,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingSku, setEditingSku] = useState<SkuPickerRow | null>(null);
  const [expandedCharts, setExpandedCharts] = useState<Set<string>>(new Set());

  const toggleChart = useCallback((id: string) => {
    setExpandedCharts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const { data, error } = await supabase
        .from('sku_items')
        .select(
          'id, brand, name, display_name, name_en, description_ru, image_url, volume_label, box_builder_slot, box_builder_sort_order, box_builder_tag_ru, box_builder_tag_en, baumann_types, baumann_recommend_reason_ru, texture_feel, pi_profile, is_active, ingredients_json',
        )
        .eq('is_active', true)
        .order('name');

      if (error) throw new Error(error.message);

      const rows = (data ?? []) as SkuPickerRow[];
      setAllSkus(rows);

      const next = Object.fromEntries(BOX_BUILDER_ADMIN_SLOTS.map((s) => [s, []])) as Record<
        BoxSlotKey,
        string[]
      >;
      for (const slot of BOX_BUILDER_ADMIN_SLOTS) {
        const inSlot = rows
          .filter((r) => r.box_builder_slot === slot)
          .sort((a, b) => (a.box_builder_sort_order ?? 0) - (b.box_builder_sort_order ?? 0))
          .map((r) => r.id)
          .slice(0, SLOT_MAX[slot]);
        next[slot] = inSlot;
      }
      setAssignments(next);
    } catch (e) {
      setMessage(`❌ 불러오기 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const skuById = useMemo(() => new Map(allSkus.map((s) => [s.id, s])), [allSkus]);

  const addSkuToSlot = (slot: BoxSlotKey, skuId: string) => {
    if (!skuId) return;
    setAssignments((prev) => {
      const max = SLOT_MAX[slot];
      const current = prev[slot].filter((id) => id !== skuId);
      if (current.length >= max) return prev;
      const cleaned = Object.fromEntries(
        BOX_BUILDER_ADMIN_SLOTS.map((s) => [
          s,
          s === slot ? [...current, skuId] : prev[s].filter((id) => id !== skuId),
        ]),
      ) as Record<BoxSlotKey, string[]>;
      return cleaned;
    });
  };

  const removeSkuFromSlot = (slot: BoxSlotKey, skuId: string) => {
    setAssignments((prev) => ({
      ...prev,
      [slot]: prev[slot].filter((id) => id !== skuId),
    }));
  };

  const moveSkuInSlot = (slot: BoxSlotKey, skuId: string, delta: -1 | 1) => {
    setAssignments((prev) => {
      const list = [...prev[slot]];
      const i = list.indexOf(skuId);
      if (i < 0) return prev;
      const j = i + delta;
      if (j < 0 || j >= list.length) return prev;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...prev, [slot]: list };
    });
  };

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    setMessage(null);
    try {
      const assignedIds = new Set(BOX_BUILDER_ADMIN_SLOTS.flatMap((s) => assignments[s]));
      const previouslyAssigned = allSkus.filter((s) => s.box_builder_slot != null).map((s) => s.id);
      const toClear = previouslyAssigned.filter((id) => !assignedIds.has(id));

      for (const id of toClear) {
        const { error } = await supabase
          .from('sku_items')
          .update({ box_builder_slot: null, box_builder_sort_order: 0 })
          .eq('id', id);
        if (error) throw new Error(error.message);
      }

      for (const slot of BOX_BUILDER_ADMIN_SLOTS) {
        for (let i = 0; i < assignments[slot].length; i++) {
          const id = assignments[slot][i];
          const row = skuById.get(id);
          const { error } = await supabase
            .from('sku_items')
            .update({
              box_builder_slot: slot,
              box_builder_sort_order: i,
              box_builder_tag_ru: row?.box_builder_tag_ru?.trim() || '',
              box_builder_tag_en: row?.box_builder_tag_en?.trim() || '',
            })
            .eq('id', id);
          if (error) {
            if (error.message.includes('box_builder_slot')) {
              throw new Error(
                'box_builder_slot 컬럼 없음 — Supabase에서 migrations/20260618030000 및 20260618040000 SQL 실행 필요',
              );
            }
            throw new Error(error.message);
          }
        }
      }

      setMessage('✅ 저장됐습니다. /shop/build 에 반영됩니다.');
      await load();
    } catch (e) {
      setMessage(`❌ 저장 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">박스 빌더 SKU 불러오는 중…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Собери свой бокс · 슬롯 SKU</h2>
          <p className="mt-1 text-sm text-slate-500">
            상품 &amp; 재고 관리에 등록된 SKU를 슬롯별로 지정합니다. 기본 6칸은 각 최대 3개, Премиум은 최대 2개까지
            /shop/build 에 노출됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition"
        >
          + 새 SKU 등록
        </button>
      </div>

      {showAddModal && (
        <SkuAddModal
          onClose={() => setShowAddModal(false)}
          onDone={() => {
            setShowAddModal(false);
            void load();
          }}
        />
      )}

      {editingSku && (
        <SkuQuickEditModal
          sku={editingSku}
          onClose={() => setEditingSku(null)}
          onSaved={(updated) => {
            setAllSkus((prev) =>
              prev.map((s) => (s.id === editingSku.id ? { ...s, ...updated } : s)),
            );
          }}
        />
      )}

      {message && (
        <p className={`rounded-xl px-4 py-3 text-sm ${message.startsWith('✅') ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
          {message}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {BOX_BUILDER_ADMIN_SLOTS.map((slot) => {
          const labels = BOX_SLOT_LABELS[slot];
          const ids = assignments[slot];
          const max = SLOT_MAX[slot];
          return (
            <section key={slot} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {labels.ru}
                  <span className="ml-2 text-xs font-normal text-slate-400">{labels.en}</span>
                </h3>
                <span className="text-xs text-slate-400">
                  {ids.length}/{max}
                </span>
              </div>

              <ul className="mb-3 space-y-2">
                {ids.length === 0 && (
                  <li className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
                    SKU 없음
                  </li>
                )}
                {ids.map((id, index) => {
                  const row = skuById.get(id);
                  return (
                    <li
                      key={id}
                      className="overflow-hidden rounded-lg border border-slate-100 bg-slate-50"
                    >
                      <div className="flex items-center gap-2 px-2 py-2">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white">
                          {row?.image_url ? (
                            <img src={row.image_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300">—</div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => row && setEditingSku(row)}
                          className="min-w-0 flex-1 text-left hover:opacity-70"
                        >
                          <p className="truncate text-xs font-medium text-slate-800">{row ? skuLabel(row) : id}</p>
                          <p className="text-[10px] text-slate-400">
                            {row?.volume_label ? `${row.volume_label} · ` : ''}순서 {index + 1}
                          </p>
                          {row?.pi_profile?.badges && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(row.pi_profile.badges.en ?? []).map((b) => (
                              <span key={b} className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                                {b}
                              </span>
                            ))}
                          </div>
                        )}
                        {slot === 'premium' ? (
                            row?.box_builder_tag_ru || row?.box_builder_tag_en ? (
                              <div className="mt-1 flex flex-wrap gap-0.5">
                                <span className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-800">
                                  {row.box_builder_tag_ru || row.box_builder_tag_en}
                                </span>
                                {row.pi_profile?.feature_tags_ko?.map((t) => (
                                  <span key={t} className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-600">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="mt-0.5 text-[9px] text-slate-300">특징 태그 미생성</p>
                            )
                          ) : row?.baumann_types && row.baumann_types.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-0.5">
                              {row.baumann_types.map((code) => (
                                <span key={code} className="rounded bg-violet-100 px-1 py-0.5 text-[9px] font-bold text-violet-700">
                                  {code}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[9px] text-slate-300">피부타입 미생성</p>
                          )}
                        </button>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveSkuInSlot(slot, id, -1)}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={index === ids.length - 1}
                            onClick={() => moveSkuInSlot(slot, id, 1)}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSkuFromSlot(slot, id)}
                            className="rounded border border-red-200 px-1.5 py-0.5 text-[10px] text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <IngredientProfileChart
                        slot={slot}
                        ings={row?.ingredients_json ?? null}
                        expanded={expandedCharts.has(id)}
                        onToggle={() => toggleChart(id)}
                      />
                    </li>
                  );
                })}
              </ul>

              {ids.length < max && (
                <select
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  defaultValue=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val) addSkuToSlot(slot, val);
                    e.currentTarget.value = '';
                  }}
                >
                  <option value="">+ SKU 추가…</option>
                  {allSkus
                    .filter((s) => !BOX_BUILDER_ADMIN_SLOTS.some((sl) => assignments[sl].includes(s.id)))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {skuLabel(s)}
                      </option>
                    ))}
                </select>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {saving ? '저장 중…' : '슬롯 저장'}
        </button>
      </div>

      {/* SKU 일괄 등록 */}
      <div className="mt-8 border-t border-slate-200 pt-6">
        <SkuBulkImport onDone={() => void load()} />
      </div>
    </div>
  );
}
