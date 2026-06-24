import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { BOX_SLOT_LABELS, type BoxSlotKey } from '../../lib/buildBoxCatalog';
import { getSkinApiBaseUrl, skinApiHeaders } from '../../lib/skinApiBaseUrl';
import { SkuImageUploadField } from '../../components/SkuImageUploadField';

const SKIN_API_URL = getSkinApiBaseUrl();

// ── 카테고리 → 슬롯 매핑 ───────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { label: '클렌저', slot: 'cleanser' as BoxSlotKey, productType: '클렌저' },
  { label: '클렌징 오일/밤', slot: 'cleanser' as BoxSlotKey, productType: '클렌저' },
  { label: '토너', slot: 'toner' as BoxSlotKey, productType: '토너' },
  { label: '세럼', slot: 'serum' as BoxSlotKey, productType: '세럼' },
  { label: '앰플', slot: 'ampoule' as BoxSlotKey, productType: '앰플' },
  { label: '수분크림', slot: 'cream' as BoxSlotKey, productType: '크림' },
  { label: '크림', slot: 'cream' as BoxSlotKey, productType: '크림' },
  { label: '선크림', slot: 'sunscreen' as BoxSlotKey, productType: '선크림' },
  { label: '프리미엄 / 스페셜', slot: 'premium' as BoxSlotKey, productType: '기타' },
] as const;

// ── 효능 태그 번역 ─────────────────────────────────────────────────────────

const BENEFIT_LABEL: Record<string, { ru: string; en: string }> = {
  hydrating: { ru: 'Увлажнение', en: 'Hydrating' },
  soothing: { ru: 'Успокоение', en: 'Soothing' },
  brightening: { ru: 'Осветление', en: 'Brightening' },
  anti_aging: { ru: 'Антивозрастной', en: 'Anti-aging' },
  oil_control: { ru: 'Контроль жирности', en: 'Oil control' },
  barrier: { ru: 'Барьер', en: 'Barrier' },
  exfoliating: { ru: 'Отшелушивание', en: 'Exfoliating' },
  antioxidant: { ru: 'Антиоксидант', en: 'Antioxidant' },
  firming: { ru: 'Упругость', en: 'Firming' },
  acne: { ru: 'Против акне', en: 'Acne care' },
  uv_protection: { ru: 'SPF защита', en: 'SPF protection' },
};

// ── 바우만 축 ──────────────────────────────────────────────────────────────

const BAUMANN_AXES = [
  { id: 'moisture', leftKey: 'D', rightKey: 'O', leftLabel: '건성 (D)', rightLabel: '지성 (O)' },
  { id: 'sensitivity', leftKey: 'S', rightKey: 'R', leftLabel: '민감 (S)', rightLabel: '저항성 (R)' },
  { id: 'pigmentation', leftKey: 'P', rightKey: 'N', leftLabel: '색소 (P)', rightLabel: '비색소 (N)' },
  { id: 'wrinkle', leftKey: 'W', rightKey: 'T', leftLabel: '주름 (W)', rightLabel: '탄탄 (T)' },
] as const;

type AxisId = 'moisture' | 'sensitivity' | 'pigmentation' | 'wrinkle';

// ── 타입 ────────────────────────────────────────────────────────────────────

type CategoryOption = (typeof CATEGORY_OPTIONS)[number];
type Step = 'form' | 'ingredients' | 'generating' | 'review' | 'done';
type IngredientMode = 'gemini' | 'paste' | 'manual';

type IngredientItem = {
  name: string;
  position?: number;
  benefit_tags?: string[];
  [key: string]: unknown;
};

interface FormData {
  name_ko: string;
  name_en: string;
  brand: string;
  category: CategoryOption | null;
  image_url: string;
}

interface ReviewData {
  tag_ru: string;
  tag_en: string;
  baumannAxes: Record<AxisId, string>;
  ingredients: IngredientItem[];
  sort_order: number;
}

export interface SkuAddModalProps {
  onClose: () => void;
  onDone: () => void;
}

// ── 헬퍼 ────────────────────────────────────────────────────────────────────

function deriveTags(ingredients: IngredientItem[]): { ru: string; en: string } {
  const tagCount: Record<string, number> = {};
  for (const ing of ingredients) {
    for (const tag of ing.benefit_tags ?? []) {
      tagCount[tag] = (tagCount[tag] ?? 0) + 1;
    }
  }
  const top2 = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tag]) => tag);

  if (top2.length === 0) return { ru: '', en: '' };
  return {
    ru: top2.map((t) => BENEFIT_LABEL[t]?.ru ?? t).join(' · '),
    en: top2.map((t) => BENEFIT_LABEL[t]?.en ?? t).join(' · '),
  };
}

function baumannToString(axes: Record<AxisId, string>): string {
  const order: AxisId[] = ['moisture', 'sensitivity', 'pigmentation', 'wrinkle'];
  return order.map((id) => (axes[id] === 'both' ? '*' : (axes[id] || '?'))).join('/');
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────

export function SkuAddModal({ onClose, onDone }: SkuAddModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [formData, setFormData] = useState<FormData>({
    name_ko: '',
    name_en: '',
    brand: '',
    category: null,
    image_url: '',
  });
  const [ingredientMode, setIngredientMode] = useState<IngredientMode>('gemini');
  const [pasteText, setPasteText] = useState('');
  const [manualText, setManualText] = useState('');
  const [generatingMsg, setGeneratingMsg] = useState('');
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const patchForm = (patch: Partial<FormData>) => setFormData((prev) => ({ ...prev, ...patch }));
  const patchReview = (patch: Partial<ReviewData>) =>
    setReviewData((prev) => (prev ? { ...prev, ...patch } : prev));

  // Step 1 → Step 2
  const handleFormNext = () => {
    const { name_ko, name_en, brand, category } = formData;
    if (!name_ko.trim() || !name_en.trim() || !brand.trim() || !category) {
      setError('모든 필수 항목을 입력해주세요.');
      return;
    }
    setError('');
    setStep('ingredients');
  };

  // Step 2 → Step 3 (AI 분석)
  const handleGenerate = async () => {
    setStep('generating');
    setError('');

    const { name_en, brand, category } = formData;
    const productType = category!.productType;
    let ingredients: IngredientItem[] = [];

    try {
      if (ingredientMode === 'gemini') {
        setGeneratingMsg('Gemini로 성분 검색 중…');
        const res = await fetch(`${SKIN_API_URL}/fetch-ingredients`, {
          method: 'POST',
          headers: skinApiHeaders,
          body: JSON.stringify({ product_name: name_en, brand, product_type: productType }),
        });
        if (!res.ok) throw new Error(`성분 검색 실패 (HTTP ${res.status})`);
        const data = (await res.json()) as {
          ingredients_json?: IngredientItem[];
          ingredients?: IngredientItem[];
        };
        ingredients = data.ingredients_json ?? data.ingredients ?? [];
      } else if (ingredientMode === 'paste') {
        if (!pasteText.trim()) throw new Error('텍스트를 입력해주세요.');
        setGeneratingMsg('성분 텍스트 파싱 중…');
        const res = await fetch(`${SKIN_API_URL}/parse-ingredients-text`, {
          method: 'POST',
          headers: skinApiHeaders,
          body: JSON.stringify({
            text: pasteText,
            product_type: productType,
            brand,
            product_name: name_en,
          }),
        });
        if (!res.ok) throw new Error(`성분 파싱 실패 (HTTP ${res.status})`);
        const data = (await res.json()) as {
          ingredients_json?: IngredientItem[];
          ingredients?: IngredientItem[];
        };
        ingredients = data.ingredients_json ?? data.ingredients ?? [];
      } else {
        ingredients = manualText
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((name, i) => ({ name, position: i + 1 }));
      }

      setGeneratingMsg('태그 생성 중…');
      const tags = deriveTags(ingredients);

      setGeneratingMsg('정렬 순서 계산 중…');
      let sortOrder = 1;
      if (supabase && category) {
        const { data: existing } = await supabase
          .from('sku_items')
          .select('box_builder_sort_order')
          .eq('box_builder_slot', category.slot)
          .order('box_builder_sort_order', { ascending: false })
          .limit(1);
        if (existing && existing.length > 0) {
          const row = existing[0] as { box_builder_sort_order?: number };
          sortOrder = (row.box_builder_sort_order ?? 0) + 1;
        }
      }

      const defaultBaumann: Record<AxisId, string> = {
        moisture: 'both',
        sensitivity: 'both',
        pigmentation: 'both',
        wrinkle: 'both',
      };

      setReviewData({
        tag_ru: tags.ru,
        tag_en: tags.en,
        baumannAxes: defaultBaumann,
        ingredients,
        sort_order: sortOrder,
      });
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep('ingredients');
    }
  };

  // Step 4: 저장
  const handleSave = async () => {
    if (!supabase || !reviewData || !formData.category) return;
    setSaving(true);
    setError('');
    try {
      const baumannStr = baumannToString(reviewData.baumannAxes);
      const tagEn = reviewData.tag_en
        ? `${reviewData.tag_en} · ${baumannStr}`
        : baumannStr;

      const { error: dbErr } = await supabase.from('sku_items').insert({
        brand: formData.brand.trim(),
        name: formData.name_en.trim(),
        display_name: formData.name_ko.trim(),
        name_en: formData.name_en.trim(),
        image_url: formData.image_url.trim() || null,
        box_builder_slot: formData.category.slot,
        box_builder_sort_order: reviewData.sort_order,
        box_builder_tag_ru: reviewData.tag_ru || '',
        box_builder_tag_en: tagEn || '',
        product_type: formData.category.productType,
        category: 'beauty',
        ingredients_json: reviewData.ingredients.length > 0 ? reviewData.ingredients : null,
        ingredients_status: reviewData.ingredients.length > 0 ? 'done' : 'pending',
        is_active: true,
      });

      if (dbErr) throw new Error(dbErr.message);
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const goBack = () => {
    if (step === 'ingredients') setStep('form');
    if (step === 'review') setStep('ingredients');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div
        className="relative flex w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">새 SKU 등록</h2>
          <div className="flex items-center gap-4">
            <StepDots step={step} />
            <button
              onClick={onClose}
              className="text-xl leading-none text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          </div>
        </div>

        {/* 바디 */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {step === 'form' && (
            <FormStep data={formData} onChange={patchForm} />
          )}

          {step === 'ingredients' && (
            <IngredientsStep
              mode={ingredientMode}
              onModeChange={setIngredientMode}
              pasteText={pasteText}
              onPasteChange={setPasteText}
              manualText={manualText}
              onManualChange={setManualText}
            />
          )}

          {step === 'generating' && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
              <p className="text-sm text-slate-500">{generatingMsg}</p>
            </div>
          )}

          {step === 'review' && reviewData && (
            <ReviewStep
              form={formData}
              review={reviewData}
              onTagRuChange={(v) => patchReview({ tag_ru: v })}
              onTagEnChange={(v) => patchReview({ tag_en: v })}
              onBaumannChange={(axis, val) =>
                patchReview({ baumannAxes: { ...reviewData.baumannAxes, [axis]: val } })
              }
            />
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="text-5xl">✅</div>
              <p className="text-base font-semibold text-slate-800">등록 완료!</p>
              <p className="text-sm text-slate-500">
                <span className="font-medium text-slate-700">{formData.brand} · {formData.name_en}</span>이(가)
                <span className="mx-1 text-brand font-medium">
                  {formData.category ? BOX_SLOT_LABELS[formData.category.slot].en : ''}
                </span>
                슬롯에 저장됐습니다.
              </p>
            </div>
          )}
        </div>

        {/* 푸터 */}
        {step !== 'generating' && (
          <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
            <div>
              {step !== 'form' && step !== 'done' && (
                <button onClick={goBack} className="text-sm text-slate-400 hover:text-slate-600">
                  ← 이전
                </button>
              )}
            </div>
            <div className="flex gap-3">
              {step === 'form' && (
                <>
                  <button onClick={onClose} className={secondaryBtn}>취소</button>
                  <button onClick={handleFormNext} className={primaryBtn}>다음 →</button>
                </>
              )}
              {step === 'ingredients' && (
                <button onClick={() => void handleGenerate()} className={primaryBtn}>
                  AI 분석 실행 ✦
                </button>
              )}
              {step === 'review' && (
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className={primaryBtn}
                >
                  {saving ? '저장 중…' : '저장하기'}
                </button>
              )}
              {step === 'done' && (
                <button onClick={onDone} className={primaryBtn}>
                  완료
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 서브 컴포넌트 ──────────────────────────────────────────────────────────

function StepDots({ step }: { step: Step }) {
  const visibleSteps: Step[] = ['form', 'ingredients', 'review'];
  const current = visibleSteps.indexOf(step);
  return (
    <div className="flex items-center gap-1.5">
      {visibleSteps.map((_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full transition-colors ${
            i <= current ? 'bg-brand' : 'bg-slate-200'
          } ${i < current ? 'opacity-50' : ''}`}
        />
      ))}
    </div>
  );
}

function FormStep({
  data,
  onChange,
}: {
  data: FormData;
  onChange: (patch: Partial<FormData>) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        필수 항목(<span className="text-red-500">*</span>)을 입력하면 나머지는 AI가 자동 생성합니다.
      </p>
      <Field label="관리용 국문명" required>
        <input
          className={inputCls}
          placeholder="예: 에스네이처 아미노산 폼 클렌저"
          value={data.name_ko}
          onChange={(e) => onChange({ name_ko: e.target.value })}
        />
      </Field>
      <Field label="영문 제품명" required>
        <input
          className={inputCls}
          placeholder="예: Amino Acid Foam Cleanser"
          value={data.name_en}
          onChange={(e) => onChange({ name_en: e.target.value })}
        />
      </Field>
      <Field label="영문 브랜드명" required>
        <input
          className={inputCls}
          placeholder="예: S.NATURE"
          value={data.brand}
          onChange={(e) => onChange({ brand: e.target.value })}
        />
      </Field>
      <Field label="제품 카테고리" required>
        <select
          className={inputCls}
          value={data.category?.label ?? ''}
          onChange={(e) => {
            const found = CATEGORY_OPTIONS.find((c) => c.label === e.target.value) ?? null;
            onChange({ category: found });
          }}
        >
          <option value="">— 선택 —</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.label} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {data.category && (
        <div className="flex items-center gap-2 rounded-lg bg-brand/5 px-3 py-2">
          <span className="text-xs text-slate-500">슬롯 자동 배정:</span>
          <span className="text-xs font-semibold text-brand">
            {BOX_SLOT_LABELS[data.category.slot].en}
          </span>
        </div>
      )}
      <SkuImageUploadField
        value={data.image_url}
        onChange={(url) => onChange({ image_url: url })}
      />
    </div>
  );
}

function IngredientsStep({
  mode,
  onModeChange,
  pasteText,
  onPasteChange,
  manualText,
  onManualChange,
}: {
  mode: IngredientMode;
  onModeChange: (m: IngredientMode) => void;
  pasteText: string;
  onPasteChange: (s: string) => void;
  manualText: string;
  onManualChange: (s: string) => void;
}) {
  const modes: { id: IngredientMode; label: string; desc: string }[] = [
    { id: 'gemini', label: 'Gemini 자동 검색', desc: '제품명+브랜드로 INCI 자동 수집' },
    { id: 'paste', label: '텍스트 붙여넣기', desc: '성분표 복사 → AI 파싱' },
    { id: 'manual', label: '직접 입력', desc: '쉼표 또는 줄바꿈 구분' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-slate-700">성분 입력 방식 선택</p>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onModeChange(m.id)}
            className={`rounded-xl border p-3 text-left transition ${
              mode === m.id
                ? 'border-brand bg-brand/5 text-brand'
                : 'border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-semibold leading-tight">{m.label}</div>
            <div className="mt-1 text-[10px] leading-snug text-slate-400">{m.desc}</div>
          </button>
        ))}
      </div>

      {mode === 'gemini' && (
        <div className="rounded-xl border border-dashed border-brand/30 bg-brand/5 px-4 py-8 text-center">
          <p className="text-sm font-medium text-brand">AI가 자동으로 성분을 가져옵니다</p>
          <p className="mt-1.5 text-xs text-slate-500">
            입력하신 영문 제품명 + 브랜드명으로 Gemini가 INCI 전성분을 검색합니다.
            <br />
            다음 단계에서 결과를 확인하고 수정할 수 있습니다.
          </p>
        </div>
      )}

      {mode === 'paste' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">
            성분표 텍스트 붙여넣기
          </label>
          <textarea
            rows={7}
            className={`${inputCls} resize-none`}
            placeholder={'Water, Glycerin, Niacinamide, Centella Asiatica Extract,\nPanthenol, Adenosine, ...'}
            value={pasteText}
            onChange={(e) => onPasteChange(e.target.value)}
          />
          <p className="text-[10px] text-slate-400">
            Gemini가 파싱 후 INCI명 정제 + 효능 분류를 자동으로 합니다.
          </p>
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">
            성분 목록 직접 입력
          </label>
          <textarea
            rows={7}
            className={`${inputCls} resize-none`}
            placeholder={'Water\nGlycerin\nNiacinamide\n...'}
            value={manualText}
            onChange={(e) => onManualChange(e.target.value)}
          />
          <p className="text-[10px] text-slate-400">
            쉼표 또는 줄바꿈으로 구분. AI 효능 분류 없이 그대로 저장됩니다.
          </p>
        </div>
      )}
    </div>
  );
}

function ReviewStep({
  form,
  review,
  onTagRuChange,
  onTagEnChange,
  onBaumannChange,
}: {
  form: FormData;
  review: ReviewData;
  onTagRuChange: (v: string) => void;
  onTagEnChange: (v: string) => void;
  onBaumannChange: (axis: AxisId, val: string) => void;
}) {
  return (
    <div className="space-y-5">
      {/* 요약 */}
      <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 leading-relaxed">
        <span className="font-semibold text-slate-700">{form.brand}</span>
        {' · '}
        <span className="text-slate-700">{form.name_en}</span>
        <span className="mx-2 text-slate-300">|</span>
        슬롯{' '}
        <span className="font-semibold text-brand">
          {form.category ? BOX_SLOT_LABELS[form.category.slot].en : ''}
        </span>
        {' · '}순서 <span className="font-semibold text-slate-700">{review.sort_order}</span>
        {review.ingredients.length > 0 && (
          <>
            <span className="mx-2 text-slate-300">|</span>
            성분 <span className="font-semibold text-slate-700">{review.ingredients.length}종</span> 수집됨
          </>
        )}
      </div>

      {/* 태그 */}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          AI 생성 태그{' '}
          <span className="text-xs font-normal text-slate-400">수정 가능</span>
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="태그 (러시아어)">
            <input
              className={inputCls}
              value={review.tag_ru}
              onChange={(e) => onTagRuChange(e.target.value)}
              placeholder="Увлажнение · Успокоение"
            />
          </Field>
          <Field label="태그 (영어)">
            <input
              className={inputCls}
              value={review.tag_en}
              onChange={(e) => onTagEnChange(e.target.value)}
              placeholder="Hydrating · Soothing"
            />
          </Field>
        </div>
      </div>

      {/* 바우만 */}
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">
          적합 피부 타입{' '}
          <span className="text-xs font-normal text-slate-400">
            내 데이터 기준으로 선택 (NotebookLM 참고)
          </span>
        </p>
        <div className="space-y-2">
          {BAUMANN_AXES.map((axis) => (
            <div key={axis.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-medium text-slate-400">
                {axis.leftKey}/{axis.rightKey}
              </span>
              {[
                { val: axis.leftKey, label: axis.leftLabel },
                { val: 'both', label: '모두' },
                { val: axis.rightKey, label: axis.rightLabel },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => onBaumannChange(axis.id as AxisId, opt.val)}
                  className={`flex-1 rounded-lg border py-1.5 text-xs transition ${
                    review.baumannAxes[axis.id as AxisId] === opt.val
                      ? 'border-brand bg-brand/10 font-semibold text-brand'
                      : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          저장 시 태그(EN)에 바우만 코드가 함께 기록됩니다. 예: Hydrating · D/S/N/T
        </p>
      </div>

      {/* 성분 미리보기 */}
      {review.ingredients.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">성분 미리보기</p>
          <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-slate-500">
              {review.ingredients.map((i) => i.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {review.ingredients.length === 0 && (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          성분 데이터가 수집되지 않았습니다. 저장 후 재고 관리에서 성분을 추가할 수 있습니다.
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';

const primaryBtn =
  'rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition';

const secondaryBtn =
  'rounded-full border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition';
