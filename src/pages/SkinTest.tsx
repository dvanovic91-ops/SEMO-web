import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  QUESTIONS,
  ANSWERS,
  SCORE_MAP,
  PROFILE_STEPS,
  SKIN_INFO,
  calcSkinType,
  approximateScoresFromSkinTypeCode,
  type SkinTypeInfo,
} from '../data/skinTestData';
import { getRecommendationPath, SKIN_TEST_CATALOG_CATEGORY } from '../config/skinTypeRecommendations';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { BackArrow } from '../components/BackArrow';
import { ProductCompositionGrid, type ProductCompositionItem } from '../components/ProductCompositionGrid';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';
import { getOrCreateVisitSessionId } from '../lib/clientSession';
import { getRecommendedProductIdForSkinType } from '../lib/skinTypeSlotMapping';
import { getSkuCompositionDisplayParts } from '../lib/skuMarketingDescriptions';
import { resolveSkuStorefrontName } from '../lib/skuStorefrontTitle';
import { getSkinApiBaseUrl, skinApiHeaders } from '../lib/skinApiBaseUrl';
import { SkinResultMetricsCharts } from '../components/SkinResultMetricsCharts';
import { buildConcernMetricFocusForApi } from '../lib/concernMetricHighlight';
import { selfieAnalysisToClientState } from '../lib/skinTestSelfie';
import { buildSkinStateSummaryParagraph } from '../lib/skinTestStateSummary';

const MAX_TEST_COUNT = 2;

const SKIN_RESULT_ROW_STORAGE = 'semo_last_skin_result_id';

/** URL `?id=` / sessionStorage — skin_test_results PK */
const SKIN_TEST_RESULT_ROW_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** products.image_urls → 테스트 결과 카드용 URL 목록 (상세와 동일 규칙 + jsonb 객체 형태 폴백) */
function normalizePreviewImageUrls(row: { image_url?: string | null; image_urls?: unknown }): string[] {
  const raw = row.image_urls;
  if (Array.isArray(raw) && raw.length > 0) {
    const out = raw
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map((s) => s.trim());
    if (out.length) return [...new Set(out)];
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const vals = Object.values(raw as Record<string, unknown>).filter(
      (u): u is string => typeof u === 'string' && u.trim().length > 0,
    );
    if (vals.length) return [...new Set(vals.map((s) => s.trim()))];
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[')) {
      try {
        const p = JSON.parse(t) as unknown;
        if (Array.isArray(p)) {
          const out = p.filter((u) => typeof u === 'string' && String(u).trim()).map((s) => String(s).trim());
          if (out.length) return [...new Set(out)];
        }
      } catch {
        /* fallthrough */
      }
    } else if (t) {
      return [t];
    }
  }
  if (row.image_url && String(row.image_url).trim()) return [String(row.image_url).trim()];
  return [];
}

/** 어드민 이메일 — 웹에서도 테스트 횟수 제한 없음 (봇 ADMIN_IDS와 별도) */
const ADMIN_EMAILS = ['admin@semo-box.ru', 'admin@semo-box.com'];
/** 테스트 횟수 제한 없음 (해당 이메일만) */
const UNLIMITED_TEST_EMAILS = ['dvanovic91@gmail.com'];

type Stage = 'intro' | 'profile' | 'concern' | 'test' | 'result';
type SelfieAnalyzeResponse = {
  error?: boolean;
  message?: string;
  retake_required?: boolean;
  message_ru?: string;
  quality_warning?: boolean;
  quality_warning_message_ru?: string;
  quality_warning_message_en?: string;
  skin_metrics?: {
    redness_index?: number;
    pigment_unevenness?: number;
    texture_roughness?: number;
    oiliness_index?: number;
    /** 트러블/뾰루지 */
    blemishes_index?: number;
    /** 칙칙함/광채 부족 */
    dullness_index?: number;
    /** 잔결/탄력 — 27세 이상만 표시 */
    fine_lines_index?: number;
  };
  gemini_analysis?: {
    ko?: { analysis?: string };
    en?: { analysis?: string };
    ru?: { analysis?: string };
  };
};

type PrecheckStats = {
  stdBrightness: number;
  edgeDensity: number;
  satMean: number;
  satP90: number;
};

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.max(0, Math.min(sorted.length - 1, Math.floor((q / 100) * (sorted.length - 1))));
  return sorted[pos] ?? 0;
}

async function precheckSelfieFile(file: File): Promise<PrecheckStats | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image-load-failed'));
      im.src = objectUrl;
    });
    const w = 320;
    const h = 320;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    const grayVals: number[] = [];
    const satVals: number[] = [];
    const gray2d = new Float32Array(w * h);
    let i = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i++) {
        const off = i * 4;
        const r = data[off] ?? 0;
        const g = data[off + 1] ?? 0;
        const b = data[off + 2] ?? 0;
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        gray2d[i] = gray;
        grayVals.push(gray);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : ((max - min) / max) * 255;
        satVals.push(sat);
      }
    }
    const mean = grayVals.reduce((a, b) => a + b, 0) / grayVals.length;
    const variance = grayVals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / grayVals.length;
    const stdBrightness = Math.sqrt(Math.max(0, variance));

    let edgeCount = 0;
    let sampleCount = 0;
    for (let y = 1; y < h; y++) {
      for (let x = 1; x < w; x++) {
        const idx = y * w + x;
        const gx = Math.abs(gray2d[idx] - gray2d[idx - 1]);
        const gy = Math.abs(gray2d[idx] - gray2d[idx - w]);
        if (gx + gy > 34) edgeCount++;
        sampleCount++;
      }
    }
    const edgeDensity = sampleCount > 0 ? edgeCount / sampleCount : 0;
    const satMean = satVals.reduce((a, b) => a + b, 0) / satVals.length;
    const satP90 = percentile(satVals, 90);
    return { stdBrightness, edgeDensity, satMean, satP90 };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** analyze-text / analyze-text-with-selfie — 섹션 배열 또는 구형 문자열 */
type AiAnalysisSection = { title: string; body: string };
type AiAnalysisSections = { ko: AiAnalysisSection[]; ru: AiAnalysisSection[]; en: AiAnalysisSection[] };

function parseAiAnalysisApiPayload(payload: {
  success?: boolean;
  ko?: unknown;
  ru?: unknown;
  en?: unknown;
  sections?: unknown;
  output_lang?: unknown;
}): AiAnalysisSections | null {
  if (payload.success === false) return null;
  const normLang = (v: unknown): AiAnalysisSection[] => {
    if (Array.isArray(v)) {
      const out: AiAnalysisSection[] = [];
      for (const item of v) {
        if (!item || typeof item !== 'object') continue;
        const o = item as Record<string, unknown>;
        const title = String(o.title ?? '').trim();
        const body = String(o.body ?? '').trim();
        if (title || body) out.push({ title, body });
      }
      return out;
    }
    if (typeof v === 'string' && v.trim()) return [{ title: '', body: v.trim() }];
    return [];
  };
  const outputLang = String(payload.output_lang ?? '').toLowerCase();
  let ko = normLang(payload.ko);
  let ru = normLang(payload.ru);
  let en = normLang(payload.en);
  const single = normLang(payload.sections);
  if (single.length > 0) {
    if (outputLang === 'en') en = single;
    else if (outputLang === 'ko') ko = single;
    else ru = single;
  }
  if (ko.length === 0 && ru.length === 0 && en.length === 0) return null;
  return { ko, ru, en };
}

function pickDisplaySections(block: AiAnalysisSections, isEn: boolean): AiAnalysisSection[] {
  const en = Array.isArray(block.en) ? block.en : [];
  const ru = Array.isArray(block.ru) ? block.ru : [];
  const ko = Array.isArray(block.ko) ? block.ko : [];
  const primary = isEn ? en : ru;
  const fallback = isEn ? ru : en;
  const has = (s: AiAnalysisSection[]) => s.some((x) => x.body.trim() || x.title.trim());
  if (has(primary)) return primary;
  if (has(fallback)) return fallback;
  return has(ko) ? ko : primary;
}

/** RU 설명 끝 이모지 제거 — desc가 비문자·정규식 오류여도 렌더가 죽지 않게 */
function stripSkinDescTrailingEmojiRu(desc: unknown): string {
  const s = String(desc ?? '');
  try {
    return s.replace(/\s*[\u2728\u{1F31F}\u{1F338}\u{1F4AB}\u{1F3C6}\u{1F33F}]+\s*$/gu, '').trim();
  } catch {
    return s.trim();
  }
}

const QUESTIONS_EN = [
  'After cleansing and before applying products, does your skin feel tight?',
  'By midday, does your skin (especially T-zone) become shiny?',
  'Are your pores visibly enlarged?',
  'Does makeup fade or move quickly?',
  'Do breakouts appear regularly?',
  'Do some cosmetics cause stinging or tingling?',
  'Does your skin flush with temperature changes or spicy food?',
  'Is your skin reactive to fragrance products?',
  'Have you had atopic or seborrheic dermatitis-like conditions?',
  'Does your skin burn quickly in the sun?',
  'Do dark marks remain long after breakouts?',
  'Do you have pigmentation, freckles, or uneven tone?',
  'In sun exposure, does your skin tan more than burn?',
  'Is skin around mouth/eyes darker than rest of face?',
  'Have you done tone-correcting procedures before?',
  'Do you notice expression lines (eye area / smile lines)?',
  'Do you notice reduced firmness or contour changes?',
  'Do pillow marks remain for a long time after sleep?',
  'Do you smoke or have frequent sun exposure?',
  'Did your parents show aging signs earlier than peers?',
] as const;

const ANSWERS_EN: [string, string][] = [
  ['Yes, definitely', 'ans_2'],
  ['Mostly yes', 'ans_1'],
  ['Not sure', 'ans_0'],
  ['Mostly no', 'ans_n1'],
  ['No, not me', 'ans_n2'],
];

const PROFILE_STEPS_EN = [
  { key: 'age', label: 'Your age?', options: [['Under 20', 'age_1'], ['20-25', 'age_2'], ['26-30', 'age_3'], ['31-35', 'age_4'], ['36-40', 'age_5'], ['41-45', 'age_6'], ['45+', 'age_7']] as [string, string][] },
  { key: 'gender', label: 'Your gender?', options: [['Female', 'gen_f'], ['Male', 'gen_m']] as [string, string][] },
  { key: 'routine', label: 'How would you describe your skin routine?', options: [['Almost none', 'rut_1'], ['Basic routine only', 'rut_2'], ['Full routine', 'rut_3']] as [string, string][] },
  { key: 'source', label: 'How did you hear about us?', options: [['Instagram / Social media', 'src_ig'], ['Friend recommendation', 'src_friend'], ['Yandex search', 'src_yandex'], ['Marketplaces', 'src_market'], ['Other', 'src_other']] as [string, string][] },
] as const;

/** 프로필 다음 단계 */
function nextProfileStep(step: number): number {
  return step + 1;
}

export const SkinTest: React.FC = () => {
  const { language, currency, country } = useI18n();
  // 국가 → 지역 코드 매핑 (도시 질문 제거 후 국가로 기후 컨텍스트 결정)
  const countryToRegion: Record<string, string> = {
    RU: 'russia_other', KZ: 'almaty', UZ: 'tashkent', AE: 'dubai',
  };
  const regionCode = countryToRegion[country] ?? 'russia_other';
  const isEn = language === 'en';
  const skinApiBase = getSkinApiBaseUrl();
  const { userId, userEmail } = useAuth();
  const activeQuestions = isEn ? QUESTIONS_EN : QUESTIONS.map((q) => q.text);
  const activeAnswers = isEn ? ANSWERS_EN : ANSWERS;
  const activeProfileSteps = isEn
    ? PROFILE_STEPS_EN
    : PROFILE_STEPS.map((s) => ({ key: s.key, label: s.label, options: s.options }));

  const englishTypeName = (type: string) => {
    const c1 = type[0] === 'D' ? 'Dry' : 'Oily';
    const c2 = type[1] === 'S' ? 'Sensitive' : 'Resistant';
    const c3 = type[2] === 'P' ? 'Pigmented' : 'Non-pigmented';
    const c4 = type[3] === 'W' ? 'Wrinkle-prone' : 'Tight/Firm';
    return `${c1} · ${c2} · ${c3} · ${c4}`;
  };

  /** 바우만 점수 기반 케어 주의사항 2~3줄 */
  const skinCareNote = (skinType: string, sc: Record<1|2|3|4, number>, en: boolean): string => {
    const isDry = skinType[0] === 'D';
    const isSens = skinType[1] === 'S';
    const isPigm = skinType[2] === 'P';
    const isWrinkle = skinType[3] === 'W';
    const sensScore = Math.abs(sc[2]);
    const lines: string[] = [];

    // 축 1: 수분/유분
    if (isDry) {
      lines.push(en
        ? `Prone to moisture loss — avoid sulfate cleansers and alcohol-based toners.`
        : `Склонна к потере влаги — откажитесь от сульфатных средств и спиртовых тоников.`);
    } else {
      lines.push(en
        ? `Excess sebum production — skip heavy creams and comedogenic oils to prevent clogged pores.`
        : `Склонна к жирному блеску — избегайте плотных кремов и комедогенных масел.`);
    }

    // 축 2: 민감도
    if (isSens) {
      lines.push(en
        ? sensScore >= 6
          ? `Highly reactive skin — acids and retinol may irritate; always patch-test before use.`
          : `Moderately sensitive — go easy on AHA/BHA, retinol and fragrances; patch-test new products.`
        : sensScore >= 6
          ? `Высокочувствительная кожа — кислоты и ретинол могут раздражать, проводите патч-тест.`
          : `Умеренно чувствительная — осторожно с AHA/BHA, ретинолом и отдушками.`);
    }

    // 축 3: 색소
    if (isPigm) {
      lines.push(en
        ? `Pigmentation-prone — daily SPF 30+ is essential, even on cloudy days.`
        : `Склонна к пигментации — ежедневный SPF 30+ обязателен, в том числе в пасмурную погоду.`);
    }

    // 축 4: 노화
    if (isWrinkle) {
      lines.push(en
        ? `Signs of aging appear early — prioritise antioxidants (vitamin C, niacinamide) and peptides.`
        : `Возрастные изменения проявляются раньше — в приоритете антиоксиданты и пептидные средства.`);
    }

    return lines.slice(0, 3).join(' ');
  };

  const englishConcernLabel = (label: string) => {
    const map: Record<string, string> = {
      'Увлажнение': 'Hydration',
      'Успокоение': 'Soothing',
      'Осветление': 'Brightening',
      'Антивозрастной уход': 'Anti-aging care',
      'Контроль жирности': 'Oil control',
    };
    return map[label] ?? label;
  };

  const englishResultDesc = (type: string) => {
    const isDry = type[0] === 'D';
    const isSensitive = type[1] === 'S';
    const isPigmented = type[2] === 'P';
    const isWrinkle = type[3] === 'W';
    const base = isDry
      ? 'Your skin tends to lose moisture, so steady hydration and barrier support are key.'
      : 'Your skin tends to produce more oil, so balanced sebum control and lightweight care are key.';
    const tolerance = isSensitive
      ? 'Because your skin is more reactive, use gentle formulas and build up active ingredients gradually.'
      : 'Your skin generally tolerates active ingredients well, so targeted formulations can work effectively.';
    const tone = isPigmented
      ? 'Focus on brightening and tone-evening care to reduce visible discoloration over time.'
      : 'Your tone profile is relatively even, so focus on consistency and long-term skin maintenance.';
    const aging = isWrinkle
      ? 'Add elasticity and anti-aging support to improve firmness and reduce visible lines.'
      : 'Maintain firmness with preventive care and daily protection to keep skin resilient.';
    return `${base} ${tolerance} ${tone} ${aging}`;
  };

  const [searchParams, setSearchParams] = useSearchParams();
  const skinTypeQueryParam = searchParams.get('type')?.trim().toUpperCase() ?? '';
  const resultRowIdQueryParam = searchParams.get('id')?.trim() ?? '';
  const resultRowIdFromQueryOk = SKIN_TEST_RESULT_ROW_UUID_RE.test(resultRowIdQueryParam);
  const { addItem } = useCart();
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);
  const noTestLimit = !!userEmail && UNLIMITED_TEST_EMAILS.includes(userEmail);
  const [stage, setStage] = useState<Stage>('intro');
  const [testCount, setTestCount] = useState<number | null>(null);
  /** insert 직후 DB 재조회 타이밍 맞춤 */
  const [resultSyncNonce, setResultSyncNonce] = useState(0);
  const [limitReached, setLimitReached] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [concernText, setConcernText] = useState('');
  const [submittedConcernContext, setSubmittedConcernContext] = useState<{ profileCode: string; freeText: string } | null>(null);
  const [aiAnalysisText, setAiAnalysisText] = useState<AiAnalysisSections | null>(null);
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);
  const [aiRetrying, setAiRetrying] = useState(false);
  /** 이전 결과 보기 시 DB 로드가 완료됐는지 여부 — 완료 전에는 에러 표시 금지 */
  const [dbAiLoadDone, setDbAiLoadDone] = useState(false);
  const [selfieConsent, setSelfieConsent] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfieFirstFlow, setSelfieFirstFlow] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    type: string;
    info: SkinTypeInfo;
    scores: Record<1 | 2 | 3 | 4, number>;
  } | null>(null);
  const [recommendedProductPreview, setRecommendedProductPreview] = useState<{
    /** 장바구니·상세 링크용 */
    productId?: string;
    name: string;
    thumb1: string | null;
    thumb2: string | null;
    composition: ProductCompositionItem[];
    prp_price?: number | null;
    rrp_price?: number | null;
    /** 상품 ID 없음 / 조회 실패 등 — 무한 «Загрузка» 방지 */
    status?: 'ok' | 'no_slot' | 'fetch_failed';
  } | null>(null);
  /** 셀피 직후 통합 문단 요청 시 최신 추천 상품 스냅샷 (클로저 stale 방지) */
  const recommendedProductPreviewRef = useRef(recommendedProductPreview);
  recommendedProductPreviewRef.current = recommendedProductPreview;
  const [postSelfieUnifiedLoading, setPostSelfieUnifiedLoading] = useState(false);
  const [cartToast, setCartToast] = useState(false);
  const [prevResultSkinType, setPrevResultSkinType] = useState<string | null>(null);
  const [prevResultAt, setPrevResultAt] = useState<string | null>(null);
  /** null = 로컬스토리지에서 쿠폰 장수 읽기 전(깜빡임 방지). 0이면 셀카 분석 UI 자체 숨김 */
  const [selfieCouponCount, setSelfieCouponCount] = useState<number | null>(null);
  const [selfieCouponNotice, setSelfieCouponNotice] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [selfieAnalyzing, setSelfieAnalyzing] = useState(false);
  const [selfieAnalyzeError, setSelfieAnalyzeError] = useState<string | null>(null);
  const [selfieAnalyzeWarning, setSelfieAnalyzeWarning] = useState<string | null>(null);
  const [selfiePrecheckWarning, setSelfiePrecheckWarning] = useState<string | null>(null);
  const [selfieAnalyzeResult, setSelfieAnalyzeResult] = useState<SelfieAnalyzeResponse | null>(null);
  const [selfieComparisonComment, setSelfieComparisonComment] = useState<string | null>(null);
  const [selfieUploadMenuOpen, setSelfieUploadMenuOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const selfieUploadWrapRef = useRef<HTMLDivElement>(null);

  const onSelfieFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelfieFile(f);
    setSelfieAnalyzeError(null);
    setSelfieAnalyzeWarning(null);
    setSelfiePrecheckWarning(null);
    setSelfieAnalyzeResult(null);
    setSelfieComparisonComment(null);
    setSelfiePreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    if (f) {
      void precheckSelfieFile(f).then((stats) => {
        if (!stats) return;
        const looksFiltered = stats.stdBrightness < 30 && stats.edgeDensity < 0.06;
        const heavyMakeup = stats.satMean > 95 && stats.satP90 > 185 && stats.edgeDensity < 0.09;
        if (looksFiltered || heavyMakeup) {
          setSelfiePrecheckWarning(
            isEn
              ? 'Warning: this photo may be over-retouched or heavily made up. Analysis can be less accurate. For best results, use no filter/beauty mode and minimal makeup.'
              : 'Предупреждение: фото похоже на сильно ретушированное или с выраженным макияжем. Точность анализа может быть ниже. Для лучшего результата — без фильтров/beauty mode и с минимальным макияжем.',
          );
        }
      });
    }
    setSelfieUploadMenuOpen(false);
    e.target.value = '';
  };

  /** 직전에 INSERT된 skin_test_results 행 id — AI 응답을 같은 행에 PATCH */
  const pendingSkinTestResultRowIdRef = useRef<string | null>(null);
  /** insert 완료 전에 셀피 분석이 끝난 경우 — 같은 행에 나중에 PATCH */
  const pendingSelfiePersistRef = useRef<Record<string, unknown> | null>(null);
  /** insert 완료 전에 AI 섹션 생성이 끝난 경우 — 같은 행에 나중에 PATCH */
  const pendingAiPersistRef = useRef<Record<string, unknown> | null>(null);
  /** DB에서 결과/셀피 스냅샷 1회 로드 (같은 키 중복 방지) */
  const persistedSkinLoadKeyRef = useRef<string>('');

  /** rowId가 늦게 확정돼도 큐잉된 selfie/ai 저장을 재시도 */
  const flushQueuedPersists = useCallback(async () => {
    if (!supabase || !userId) return;
    const rowId = pendingSkinTestResultRowIdRef.current;
    if (!rowId) return;

    const queuedSelfie = pendingSelfiePersistRef.current;
    if (queuedSelfie) {
      const { data, error } = await supabase
        .from('skin_test_results')
        .update({ selfie_analysis: queuedSelfie })
        .eq('id', rowId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (!error && data?.id) pendingSelfiePersistRef.current = null;
      else console.error('[SkinTest] queued selfie_analysis retry flush:', error ?? '0 rows');
    }

    const queuedAi = pendingAiPersistRef.current;
    if (queuedAi) {
      const { data, error } = await supabase
        .from('skin_test_results')
        .update({ ai_analysis: queuedAi })
        .eq('id', rowId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();
      if (!error && data?.id) pendingAiPersistRef.current = null;
      else console.error('[SkinTest] queued ai_analysis retry flush:', error ?? '0 rows');
    }
  }, [supabase, userId]);

  /** AI 분석 JSON을 현재 결과 행에 저장 — insert 지연 시 잠시 대기, 실패 시 큐 + flush */
  const persistAiAnalysisToRow = useCallback(
    async (aiPersist: Record<string, unknown>): Promise<boolean> => {
      if (!supabase || !userId) {
        pendingAiPersistRef.current = aiPersist;
        return false;
      }
      const tryUpdate = async (rowId: string) => {
        const { data, error } = await supabase
          .from('skin_test_results')
          .update({ ai_analysis: aiPersist })
          .eq('id', rowId)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle();
        if (error) {
          console.error('[SkinTest] ai_analysis update:', error.message, error);
          return false;
        }
        if (!data?.id) {
          console.error('[SkinTest] ai_analysis update: 0 rows (RLS/id mismatch?)', { rowId });
          return false;
        }
        return true;
      };

      let rowId = pendingSkinTestResultRowIdRef.current;
      if (rowId && (await tryUpdate(rowId))) return true;

      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 100));
        rowId = pendingSkinTestResultRowIdRef.current;
        if (!rowId) {
          try {
            const sid = sessionStorage.getItem(SKIN_RESULT_ROW_STORAGE);
            if (sid && SKIN_TEST_RESULT_ROW_UUID_RE.test(sid)) {
              pendingSkinTestResultRowIdRef.current = sid;
              rowId = sid;
            }
          } catch {
            /* ignore */
          }
        }
        if (rowId && (await tryUpdate(rowId))) return true;
      }

      console.error('[SkinTest] ai_analysis: row id not ready or update failed; queueing for flush');
      pendingAiPersistRef.current = aiPersist;
      void flushQueuedPersists();
      return false;
    },
    [supabase, userId, flushQueuedPersists],
  );

  /** 프로필 «Посмотреть результат теста» → ?type=DSNW[&id=uuid]: 동일 결과지 UI
   *  id가 있으면 해당 skin_test_results 행(셀피·점수) 로드에 쓰도록 sessionStorage·pending ref 설정.
   *  id 없이 type만 있으면 sessionStorage 제거 → 동일 타입 최신 행 로드.
   *  의존성은 문자열만 사용 (RR7 URLSearchParams 참조 불안정 방지). */
  useLayoutEffect(() => {
    const raw = skinTypeQueryParam;
    if (!raw || !SKIN_INFO[raw]) return;
    persistedSkinLoadKeyRef.current = '';
    pendingSkinTestResultRowIdRef.current = null;

    if (resultRowIdFromQueryOk) {
      try {
        sessionStorage.setItem(SKIN_RESULT_ROW_STORAGE, resultRowIdQueryParam);
      } catch {
        /* ignore */
      }
      pendingSkinTestResultRowIdRef.current = resultRowIdQueryParam;
      void flushQueuedPersists();
    } else {
      try {
        sessionStorage.removeItem(SKIN_RESULT_ROW_STORAGE);
      } catch {
        /* ignore */
      }
    }

    setResult({
      type: raw,
      info: SKIN_INFO[raw],
      scores: approximateScoresFromSkinTypeCode(raw),
    });
    setSubmittedConcernContext(null);
    setStage('result');
  }, [skinTypeQueryParam, resultRowIdQueryParam, resultRowIdFromQueryOk]);

  useEffect(() => {
    if (stage !== 'result') return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      void flushQueuedPersists();
    };
    tick();
    const timer = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [stage, flushQueuedPersists]);

  /** 장바구니 토스트 */
  useEffect(() => {
    if (!cartToast) return;
    const t = window.setTimeout(() => setCartToast(false), 2800);
    return () => window.clearTimeout(t);
  }, [cartToast]);

  /** 회원 기준 skin_test_results 건수 조회 (2회 제한용) */
  useEffect(() => {
    if (!supabase || !userId) {
      setTestCount(null);
      setLimitReached(false);
      return;
    }
    supabase
      .from('skin_test_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count }) => {
        const n = count ?? 0;
        setTestCount(n);
        setLimitReached(!noTestLimit && n >= MAX_TEST_COUNT);
      })
      .catch(() => setTestCount(0));
  }, [userId, noTestLimit]);

  /** 회원: 이전 테스트(직전 1건) 불러와서 결과 비교 코멘트에 사용 */
  useEffect(() => {
    if (!supabase || !userId) {
      setPrevResultSkinType(null);
      setPrevResultAt(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('skin_test_results')
      .select('skin_type, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (cancelled) return;
        const row = (data?.[0] as { skin_type?: string | null; created_at?: string | null } | undefined) ?? null;
        setPrevResultSkinType(row?.skin_type ?? null);
        setPrevResultAt(row?.created_at ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setPrevResultSkinType(null);
        setPrevResultAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** 회원: 저장된 테스트 행에서 셀피 수치·AI 문구·정확한 바우만 점수 복원 (새로고침·프로필 링크) */
  useEffect(() => {
    if (stage !== 'result' || !result || !userId || !supabase) return;
    const sid =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SKIN_RESULT_ROW_STORAGE) : null;
    const rowIdForKey =
      resultRowIdFromQueryOk && resultRowIdQueryParam ? resultRowIdQueryParam : sid ?? '';
    const loadKey = `${userId}:${result.type}:${resultSyncNonce}:${rowIdForKey}`;
    if (persistedSkinLoadKeyRef.current === loadKey) return;
    let cancelled = false;

    void (async () => {
      try {
      const uuidOk = !!sid && SKIN_TEST_RESULT_ROW_UUID_RE.test(sid);

      type RowT = {
        id: string;
        skin_type: string | null;
        concern_text?: string | null;
        selfie_analysis: unknown;
        ai_analysis: unknown;
        baumann_scores: unknown;
      };
      let row: RowT | null = null;

      if (uuidOk) {
        const { data } = await supabase
          .from('skin_test_results')
          .select('id, skin_type, concern_text, selfie_analysis, ai_analysis, baumann_scores')
          .eq('user_id', userId)
          .eq('id', sid as string)
          .maybeSingle();
        if (cancelled) return;
        const d = data as RowT | null;
        if (d && String(d.skin_type || '').trim().toUpperCase() === result.type) row = d;
      }
      if (!row) {
        const { data } = await supabase
          .from('skin_test_results')
          .select('id, skin_type, concern_text, selfie_analysis, ai_analysis, baumann_scores')
          .eq('user_id', userId)
          .ilike('skin_type', result.type)
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        row = (data as RowT | null) ?? null;
      }

      if (cancelled) return;
      if (!row) {
        setDbAiLoadDone(true);
        persistedSkinLoadKeyRef.current = loadKey;
        return;
      }

      pendingSkinTestResultRowIdRef.current = row.id;
      void flushQueuedPersists();

      const ct = row.concern_text;
      if (typeof ct === 'string' && ct.trim()) setConcernText(ct.trim());

      let bsRaw: unknown = row.baumann_scores;
      if (typeof bsRaw === 'string') {
        try {
          bsRaw = JSON.parse(bsRaw) as unknown;
        } catch {
          bsRaw = null;
        }
      }
      const bs = bsRaw && typeof bsRaw === 'object' ? (bsRaw as Record<string, unknown>) : null;
      if (bs) {
        const n = (k: string) => {
          const v = bs[k] ?? bs[String(k)];
          const x = typeof v === 'number' ? v : Number(v);
          return Number.isFinite(x) ? x : undefined;
        };
        setResult((prev) => {
          if (!prev || prev.type !== result.type) return prev;
          return {
            ...prev,
            scores: {
              1: n('1') ?? prev.scores[1],
              2: n('2') ?? prev.scores[2],
              3: n('3') ?? prev.scores[3],
              4: n('4') ?? prev.scores[4],
            },
          };
        });
      }

      const selfieState = selfieAnalysisToClientState(row.selfie_analysis);
      if (selfieState) {
        setSelfieAnalyzeResult({
          skin_metrics: selfieState.skin_metrics as SelfieAnalyzeResponse['skin_metrics'],
          gemini_analysis: selfieState.gemini_analysis as SelfieAnalyzeResponse['gemini_analysis'],
        });
      } else {
        setSelfieAnalyzeResult(null);
      }

      let aiRaw: unknown = row.ai_analysis;
      if (typeof aiRaw === 'string') {
        try {
          aiRaw = JSON.parse(aiRaw) as unknown;
        } catch {
          aiRaw = null;
        }
      }
      if (aiRaw && typeof aiRaw === 'object' && !Array.isArray(aiRaw)) {
        const a = aiRaw as Record<string, unknown>;
        const parsed = parseAiAnalysisApiPayload({
          success: true,
          ko: a.ko,
          ru: a.ru,
          en: a.en,
        });
        if (parsed) setAiAnalysisText(parsed);
      }
      // 주의: DB 재조회 시점에 ai_analysis가 아직 비어 있을 수 있다.
      // 이때 기존에 화면에 보이는 AI 결과를 null로 덮어쓰면
      // "잘 보이다가 다시 풀백/로딩으로 돌아가는" 깜빡임이 발생하므로 유지한다.

      setDbAiLoadDone(true);
      persistedSkinLoadKeyRef.current = loadKey;
      } catch (e) {
        console.error('[SkinTest] persisted skin row load:', e);
        setDbAiLoadDone(true);
        persistedSkinLoadKeyRef.current = loadKey;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stage, result?.type, resultSyncNonce, userId, resultRowIdQueryParam, resultRowIdFromQueryOk, flushQueuedPersists]);

  /** 쿠폰 0이 되면 열린 셀카 패널 닫기 */
  useEffect(() => {
    if (selfieCouponCount === 0) setSelfieOpen(false);
  }, [selfieCouponCount]);

  useEffect(() => {
    if (!selfieOpen) setSelfieUploadMenuOpen(false);
  }, [selfieOpen]);

  // 결과 화면 노출 규칙:
  // - 테스트 마지막 단계의 셀피 우선 플로우(selfieFirstFlow)에서는 펼침
  // - 일반 결과지에서는 접힘
  useEffect(() => {
    if (stage !== 'result') return;
    setSelfieOpen(!!selfieFirstFlow);
  }, [stage, selfieFirstFlow]);

  /** 회원: 셀카 분석 쿠폰 잔액(Supabase selfie_coupon_balances) */
  useEffect(() => {
    if (!userId || !supabase) {
      setSelfieCouponCount(null);
      setSelfieCouponNotice(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('selfie_coupon_balances')
        .select('balance')
        .eq('user_id', userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn('[SkinTest] selfie_coupon_balances:', error);
        setSelfieCouponCount(0);
        setSelfieCouponNotice(null);
        return;
      }
      const b = (data as { balance?: number } | null)?.balance;
      setSelfieCouponCount(typeof b === 'number' ? Math.max(0, b) : 0);
      setSelfieCouponNotice(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, supabase]);

  useEffect(() => {
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    };
  }, [selfiePreviewUrl]);

  useEffect(() => {
    if (!selfieUploadMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = selfieUploadWrapRef.current;
      if (el && !el.contains(e.target as Node)) setSelfieUploadMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [selfieUploadMenuOpen]);

  useEffect(() => {
    if (!result?.type || !supabase) {
      setRecommendedProductPreview(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const terminalNoProduct = () => {
        if (!cancelled) {
          setRecommendedProductPreview({
            name: 'Beauty box',
            thumb1: null,
            thumb2: null,
            composition: [],
            status: 'no_slot',
          });
        }
      };
      const terminalFetchFailed = () => {
        if (!cancelled) {
          setRecommendedProductPreview({
            name: 'Beauty box',
            thumb1: null,
            thumb2: null,
            composition: [],
            status: 'fetch_failed',
          });
        }
      };

      try {
        const productId = await getRecommendedProductIdForSkinType(result.type);
        if (!productId || cancelled) {
          if (!cancelled) terminalNoProduct();
          return;
        }

        // category 컬럼이 없는 운영 DB에서도 조회되도록 1차: 전체, 실패 시 최소 컬럼만 재시도
        let productData: {
          name?: string | null;
          image_url?: string | null;
          image_urls?: unknown;
          category?: string | null;
          prp_price?: number | null;
          rrp_price?: number | null;
        } | null = null;
        const selFull = await supabase
          .from('products')
          .select('name, image_url, image_urls, category, prp_price, rrp_price')
          .eq('id', productId)
          .maybeSingle();
        if (selFull.error) {
          const selMini = await supabase
            .from('products')
            .select('name, image_url, image_urls, prp_price, rrp_price')
            .eq('id', productId)
            .maybeSingle();
          if (!selMini.error) productData = selMini.data as typeof productData;
        } else {
          productData = selFull.data as typeof productData;
        }

        if (cancelled) return;
        if (!productData) {
          terminalFetchFailed();
          return;
        }

        const cat = productData.category;
        if (cat != null && cat !== SKIN_TEST_CATALOG_CATEGORY) {
          terminalNoProduct();
          return;
        }

        const ordered = normalizePreviewImageUrls(productData);
        const thumb1 = ordered[0] ?? null;
        const thumb2 = ordered[1] ?? null;

        /** ProductDetail과 동일: `.order()` 없이 조회 후 sort_order 정렬 (PostgREST/스키마 차이로 order 400 나는 경우 방지) */
        const compositionSelectAttempts = [
          '*, sku_items(brand, country_of_origin, display_name, name, name_en, description, description_en, description_ru, key_ingredients_desc, image_url, product_type)',
          '*, sku_items(brand, display_name, name, name_en, description, description_en, description_ru, key_ingredients_desc, image_url, product_type)',
          '*, sku_items(brand, display_name, name, name_en, image_url, product_type)',
          'id, sort_order, sku_id, name, image_url, image_urls, description, description_ru, description_en, is_customized',
        ];

        let compRows: Record<string, unknown>[] = [];
        for (const sel of compositionSelectAttempts) {
          const { data, error } = await supabase.from('product_components').select(sel).eq('product_id', productId);
          if (!error && Array.isArray(data)) {
            compRows = [...(data as Record<string, unknown>[])].sort(
              (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
            );
            break;
          }
        }

        const composition: ProductCompositionItem[] = compRows
          .map((c) => {
            const sku = c.sku_items as {
              brand?: string | null;
              country_of_origin?: string | null;
              display_name?: string | null;
              name?: string | null;
              name_en?: string | null;
              description?: string | null;
              description_ru?: string | null;
              description_en?: string | null;
              image_url?: string | null;
              key_ingredients_desc?: Array<{ name: string; ko: string; en: string; ru: string }> | null;
              product_type?: string | null;
            } | null;
            const hasSkuImage = !!sku?.image_url;
            const parts = getSkuCompositionDisplayParts(sku);
            const keyIngredients = Array.isArray(sku?.key_ingredients_desc)
              ? sku!.key_ingredients_desc
                  .map((x) => String(x?.name ?? '').trim())
                  .filter((v): v is string => v.length > 0)
                  .slice(0, 5)
                  .join(', ')
              : null;
            return {
              id: String(c.id),
              sku_id: typeof c.sku_id === 'string' ? c.sku_id : null,
              brand: sku?.brand ?? null,
              country_of_origin: sku?.country_of_origin ?? null,
              name: resolveSkuStorefrontName({
                display_name: sku?.display_name,
                name_en: sku?.name_en,
                name: sku?.name,
                fallbackName: (c.name as string | null) ?? null,
                language,
              }),
              image_url: hasSkuImage ? sku!.image_url! : (c.image_url as string | null) ?? null,
              image_urls: hasSkuImage ? [sku!.image_url!] : (c.image_urls as string[] | null) ?? null,
              description: parts.ko.body ?? (c.description as string | null) ?? null,
              description_ru: parts.ru.body ?? (c.description_ru as string | null) ?? null,
              description_en: parts.en.body ?? (c.description_en as string | null) ?? null,
              marketing_claim: parts.ko.claim,
              marketing_claim_ru: parts.ru.claim,
              marketing_claim_en: parts.en.claim,
              product_type: sku?.product_type ?? null,
              is_customized: Boolean(c.is_customized),
              key_ingredients: keyIngredients,
            };
          });

        if (!cancelled) {
          setRecommendedProductPreview({
            productId,
            name: productData.name ?? 'Beauty box',
            thumb1,
            thumb2,
            composition,
            prp_price: productData.prp_price != null ? Number(productData.prp_price) : null,
            rrp_price: productData.rrp_price != null ? Number(productData.rrp_price) : null,
            status: 'ok',
          });
        }
      } catch {
        if (!cancelled) terminalFetchFailed();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [result?.type, language]);

  /** AI 분석 호출:
   * - 새 테스트 결과(쿼리 없음): 1회 생성 허용
   * - 이전 테스트 결과(?type=...): 재호출 금지, DB 저장본만 사용
   */
  useEffect(() => {
    if (!result?.type) {
      setAiAnalysisText(null);
      setAiAnalysisLoading(false);
      setAiAnalysisError(null);
      setDbAiLoadDone(false);
      return;
    }
    // 이미 화면에 AI 결과가 있으면 같은 결과에 대해 재호출하지 않는다.
    // (의존성 변경/DB 재동기화 타이밍으로 텍스트가 계속 바뀌는 현상 방지)
    if (aiAnalysisText) {
      setAiAnalysisLoading(false);
      setAiAnalysisError(null);
      return;
    }
    // 이전 테스트 결과 보기에서는 API 재생성을 금지하고 DB 저장본만 사용
    // DB 로드가 아직 완료되지 않은 경우 로딩 표시하며 대기 (레이스 컨디션 방지)
    if (skinTypeQueryParam) {
      if (!dbAiLoadDone) {
        setAiAnalysisLoading(true);
        setAiAnalysisError(null);
        return;
      }
      // DB 로드 완료 후에도 AI 텍스트가 없을 때만 에러 표시
      setAiAnalysisLoading(false);
      setAiRetrying(false);
      if (!aiAnalysisText) {
        setAiAnalysisError(
          isEn
            ? 'Saved AI text is not available for this result.'
            : 'Для этого результата сохранённый AI-текст отсутствует.',
        );
      }
      return;
    }
    let cancelled = false;
    setAiAnalysisLoading(true);
    setAiAnalysisError(null);
    setAiRetrying(false);
    (async () => {
      try {
        const preview = recommendedProductPreview;
        const recName =
          preview?.status === 'ok' && preview.name?.trim() ? preview.name.trim() : '';
        const compHint =
          preview?.status === 'ok' && Array.isArray(preview.composition)
            ? preview.composition
                .slice(0, 5)
                .map((c) => c.product_type ?? c.name)
                .filter((v): v is string => !!v && String(v).trim().length > 0)
                .join(', ')
            : '';
        const concernMetricFocus = buildConcernMetricFocusForApi(profileData.concern, concernText || '');
        const customizedProducts =
          preview?.status === 'ok' && Array.isArray(preview.composition)
            ? preview.composition
                .filter((c) => c.is_customized)
                .slice(0, 3)
                .map((c) => ({
                  name: String(c.name ?? '').trim(),
                  product_type: String(c.product_type ?? '').trim(),
                  key_ingredients: String(c.key_ingredients ?? '').trim(),
                  is_customized: true,
                }))
                .filter((c) => c.name.length > 0)
            : [];
        const outputLang = isEn ? 'en' : 'ru';
        let parsed: AiAnalysisSections | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const res = await fetch(`${skinApiBase}/analyze-text`, {
              method: 'POST',
              headers: skinApiHeaders,
              body: JSON.stringify({
                skin_type: result.type,
                concern_text: concernText || '',
                country,
                age_code: profileData.age ?? 'age_3',
                baumann_scores: result.scores,
                output_lang: outputLang,
                ...(recName ? { recommended_product_name: recName } : {}),
                ...(compHint ? { composition_product_types: compHint } : {}),
                ...(customizedProducts.length > 0 ? { customized_products: customizedProducts } : {}),
                ...(concernMetricFocus ? { concern_metric_focus: concernMetricFocus } : {}),
              }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const payload = await res.json() as {
              success?: boolean;
              ko?: unknown;
              ru?: unknown;
              en?: unknown;
              sections?: unknown;
              output_lang?: unknown;
            };
            parsed = parseAiAnalysisApiPayload(payload);
            if (parsed) break;
            throw new Error('empty-ai-payload');
          } catch {
            if (attempt === 0 && !cancelled) {
              setAiRetrying(true);
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
            throw new Error('analyze-text-failed');
          }
        }
        if (!cancelled && parsed) {
          setAiAnalysisText(parsed);
          setAiAnalysisError(null);
          const aiPersist = {
            en: parsed.en,
            ru: parsed.ru,
            ko: parsed.ko,
          };
          if (supabase && userId) {
            await persistAiAnalysisToRow(aiPersist);
          } else {
            pendingAiPersistRef.current = aiPersist;
          }
        } else if (!cancelled) {
          setAiAnalysisError(isEn ? 'AI analysis could not be generated.' : 'Не удалось сформировать AI-анализ.');
        }
      } catch {
        if (!cancelled) {
          setAiAnalysisError(isEn ? 'AI analysis request failed.' : 'Ошибка запроса AI-анализа.');
        }
      } finally {
        if (!cancelled) {
          setAiRetrying(false);
          setAiAnalysisLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 직후 생성 + 추천 상품 로드 후 한 번 더 보강
  }, [
    result?.type,
    skinTypeQueryParam,
    dbAiLoadDone,
    userId,
    concernText,
    profileData.concern,
    recommendedProductPreview?.status,
    recommendedProductPreview?.name,
    recommendedProductPreview?.composition,
    persistAiAnalysisToRow,
  ]);

  const canAddRecommendedToCart =
    recommendedProductPreview?.status === 'ok' && !!recommendedProductPreview.productId;

  const handleAddRecommendedToCart = () => {
    const p = recommendedProductPreview;
    if (!p || p.status !== 'ok' || !p.productId) return;
    const thumb = p.thumb1 ?? p.thumb2 ?? null;
    const prp = p.prp_price != null ? Number(p.prp_price) : null;
    const rrp = p.rrp_price != null ? Number(p.rrp_price) : null;
    addItem({
      id: p.productId,
      name: p.name,
      price: prp ?? rrp ?? 0,
      imageUrl: thumb,
      originalPrice: prp != null && rrp != null ? rrp : undefined,
      currency,
    });
    setCartToast(true);
  };

  const handleAgree = () => {
    if (!isAdmin && !noTestLimit && limitReached) return;
    setStage('profile');
    setProfileStep(0);
  };

  const handleProfileSelect = (key: string, value: string) => {
    const next = { ...profileData, [key]: value };
    setProfileData(next);
    if (profileStep + 1 >= activeProfileSteps.length) {
      // 마지막 프로필 단계 → 바로 테스트로 (피부 고민은 테스트 후에)
      setStage('test');
      setQuestionIndex(0);
      setAnswers([]);
    } else {
      setProfileStep(nextProfileStep(profileStep));
    }
  };

  const handleConcernNext = () => {
    // 피부 고민 입력 완료 → 로그인 사용자는 셀피 업로드 우선 플로우
    if (userId && (selfieCouponCount ?? 0) > 0) {
      setSelfieFirstFlow(true);
      // 마지막 단계 업로드 유도는 펼친 상태로 시작
      setSelfieOpen(true);
    }
    handleFinalSubmit();
  };

  const handleProfilePrev = () => {
    if (profileStep === 0) {
      setStage('intro');
      return;
    }
    setProfileStep(profileStep - 1);
  };

  const isLastQuestion = questionIndex + 1 >= QUESTIONS.length;

  const handleAnswer = (valueKey: string) => {
    const raw = SCORE_MAP[valueKey];
    const q = QUESTIONS[questionIndex];
    const score = q.reversed ? -raw : raw;

    if (isLastQuestion && answers.length === QUESTIONS.length) {
      const lastScore = answers[answers.length - 1];
      if (score === lastScore) {
        setAnswers(answers.slice(0, -1));
        return;
      }
      setAnswers([...answers.slice(0, -1), score]);
      return;
    }

    setAnswers([...answers, score]);
    if (!isLastQuestion) setQuestionIndex(questionIndex + 1);
  };

  const handlePrev = () => {
    if (questionIndex <= 0) return;
    setQuestionIndex(questionIndex - 1);
    setAnswers(answers.slice(0, -1));
  };

  const handleBackToProfile = () => {
    setStage('profile');
    setProfileStep(0);
  };

  const handleFinalSubmit = () => {
    try {
      if (answers.length !== QUESTIONS.length) {
        console.warn('[SkinTest] handleFinalSubmit: 답변 수 불일치', answers.length, '/', QUESTIONS.length);
        return;
      }
      const { type, scores } = calcSkinType(answers);
      const info = SKIN_INFO[type] ?? {
        name: type,
        desc: isEn ? 'Test result saved.' : 'Результат теста сохранён.',
        concerns: [] as string[],
        avoid: '',
      };
      setSubmittedConcernContext({
        profileCode: String(profileData.concern ?? '').trim(),
        freeText: String(concernText ?? '').trim(),
      });
      /* 프로필 링크 등으로 남아 있던 ?type=&id= 가 있으면 AI effect가 «저장 결과만» 분기로 막혀 analyze-text·DB 저장이 안 됨 */
      try {
        setSearchParams(new URLSearchParams(), { replace: true });
      } catch {
        /* ignore */
      }
      setResult({ type, info, scores });
      persistedSkinLoadKeyRef.current = '';
      setSelfieAnalyzeError(null);
      setSelfieAnalyzeResult(null);
      setSelfieComparisonComment(null);
      if (selfiePreviewUrl) {
        URL.revokeObjectURL(selfiePreviewUrl);
        setSelfiePreviewUrl(null);
      }
      setSelfieFile(null);
      if (userId) {
        if (supabase) {
          pendingSkinTestResultRowIdRef.current = null;
          try {
            sessionStorage.removeItem(SKIN_RESULT_ROW_STORAGE);
          } catch {
            /* ignore */
          }
          const baumann_scores = {
            '1': scores[1],
            '2': scores[2],
            '3': scores[3],
            '4': scores[4],
          };
          void supabase
            .from('skin_test_results')
            .insert({
              user_id: userId,
              skin_type: type,
              concern_text: concernText || null,
              baumann_scores,
            })
            .select('id')
            .single()
            .then(({ data, error }) => {
              if (error) {
                console.error('[SkinTest] skin_test_results insert 실패:', error);
                return;
              }
              if (data?.id) {
                pendingSkinTestResultRowIdRef.current = data.id;
                void flushQueuedPersists();
                try {
                  sessionStorage.setItem(SKIN_RESULT_ROW_STORAGE, data.id);
                } catch {
                  /* ignore */
                }
                const queued = pendingSelfiePersistRef.current;
                if (queued) {
                  pendingSelfiePersistRef.current = null;
                  void supabase
                    .from('skin_test_results')
                    .update({ selfie_analysis: queued })
                    .eq('id', data.id)
                    .eq('user_id', userId)
                    .select('id')
                    .maybeSingle()
                    .then(({ data: upRow, error: upErr }) => {
                      if (upErr || !upRow?.id) {
                        console.error('[SkinTest] queued selfie_analysis flush:', upErr ?? '0 rows');
                        pendingSelfiePersistRef.current = queued;
                      }
                    });
                }
                const queuedAi = pendingAiPersistRef.current;
                if (queuedAi) {
                  pendingAiPersistRef.current = null;
                  void supabase
                    .from('skin_test_results')
                    .update({ ai_analysis: queuedAi })
                    .eq('id', data.id)
                    .eq('user_id', userId)
                    .select('id')
                    .maybeSingle()
                    .then(({ data: upRow, error: upErr }) => {
                      if (upErr || !upRow?.id) {
                        console.error('[SkinTest] queued ai_analysis flush:', upErr ?? '0 rows');
                        pendingAiPersistRef.current = queuedAi;
                      }
                    });
                }
                setResultSyncNonce((n) => n + 1);
              }
              setTestCount((c) => {
                const next = c === null ? 1 : c + 1;
                if (next >= MAX_TEST_COUNT) setLimitReached(true);
                return next;
              });
            });
        }
      } else {
        try {
          const sid = getOrCreateVisitSessionId();
          localStorage.setItem(`semo_anon_result:${sid}`, JSON.stringify({ skin_type: type }));
          localStorage.setItem(`semo_anon_test_done:${sid}`, '1');
        } catch {
          // ignore
        }
      }
      setStage('result');
    } catch (err) {
      console.error('[SkinTest] handleFinalSubmit 오류:', err);
      // 결과 계산 실패 시 fallback — 흰 화면 방지
      setResult({
        type: 'DRNT',
        info: SKIN_INFO['DRNT'] ?? {
          name: 'DRNT',
          desc: isEn ? 'Test result saved.' : 'Результат теста сохранён.',
          concerns: [],
          avoid: '',
        },
        scores: { 1: 0, 2: 0, 3: 0, 4: 0 },
      });
      setStage('result');
    }
  };

  const cityToRegionCode: Record<string, string> = {
    city_1: 'moscow',
    city_2: 'spb',
    city_3: 'novosibirsk',
    city_4: 'ekaterinburg',
    city_5: 'kazan',
    city_6: 'nn',
    city_7: 'chelyabinsk',
    city_8: 'samara',
    city_9: 'russia_other',
  };

  const handleSelfieAnalyze = async () => {
    if (!userId) {
      setSelfieAnalyzeError(isEn ? 'Login required.' : 'Требуется вход.');
      return;
    }
    if (!result) return;
    if (selfieCouponCount == null || selfieCouponCount <= 0) {
      setSelfieAnalyzeError(isEn ? 'No selfie-analysis coupon left.' : 'Купон на селфи-анализ закончился.');
      return;
    }
    if (!selfieFile) {
      setSelfieAnalyzeError(isEn ? 'Upload selfie first.' : 'Сначала загрузите селфи.');
      return;
    }
    setSelfieAnalyzing(true);
    setSelfieAnalyzeError(null);
    setSelfieAnalyzeWarning(null);
    try {
      const fd = new FormData();
      fd.append('image', selfieFile);
      fd.append('bauman_type', result.type);
      fd.append('bauman_scores', JSON.stringify(result.scores));
      fd.append('region', regionCode);
      fd.append('age_code', profileData.age ?? 'age_3');
      fd.append('user_id', userId);
      fd.append('skin_concern', concernText || '');
      let res: Response;
      try {
        res = await fetch(`${skinApiBase}/analyze`, {
          method: 'POST',
          body: fd,
        });
      } catch {
        throw new Error(
          isEn
            ? `Cannot reach the analysis server. Dev: run Flask on 5001 and use same-origin proxy (${skinApiBase}). Prod: set VITE_SKIN_API_URL or reverse-proxy /skin-api to the API.`
            : `Не удалось связаться с сервером анализа. Dev: Flask на 5001 и прокси ${skinApiBase}. Prod: VITE_SKIN_API_URL или reverse-proxy /skin-api.`,
        );
      }
      const rawText = await res.text();
      let payload: SelfieAnalyzeResponse;
      try {
        payload = rawText ? (JSON.parse(rawText) as SelfieAnalyzeResponse) : ({} as SelfieAnalyzeResponse);
      } catch {
        throw new Error(
          isEn
            ? `Analysis server returned non-JSON (HTTP ${res.status}). Is the skin API running? Base: ${skinApiBase}`
            : `Сервер анализа вернул не JSON (HTTP ${res.status}). База: ${skinApiBase}`,
        );
      }
      if (!res.ok || payload.error) throw new Error(payload.message || (isEn ? 'Selfie analysis failed.' : 'Селфи-анализ не выполнен.'));
      if (payload.retake_required) throw new Error(payload.message_ru || (isEn ? 'Please retake selfie.' : 'Нужно переснять селфи.'));
      if (payload.quality_warning) {
        const warningText = isEn ? payload.quality_warning_message_en : payload.quality_warning_message_ru;
        if (warningText && String(warningText).trim()) setSelfieAnalyzeWarning(String(warningText).trim());
      }
      setSelfieAnalyzeResult(payload);
      setSelfieOpen(false);

      const selfiePersist = {
        analyzed_at: new Date().toISOString(),
        skin_metrics: payload.skin_metrics ?? {},
        gemini_analysis: payload.gemini_analysis ?? null,
      };

      const resolveRowIdForSelfie = async (): Promise<string | null> => {
        if (pendingSkinTestResultRowIdRef.current) return pendingSkinTestResultRowIdRef.current;
        try {
          const sid = sessionStorage.getItem(SKIN_RESULT_ROW_STORAGE);
          if (sid && SKIN_TEST_RESULT_ROW_UUID_RE.test(sid)) {
            pendingSkinTestResultRowIdRef.current = sid;
            void flushQueuedPersists();
            return sid;
          }
        } catch {
          /* ignore */
        }
        for (let i = 0; i < 50; i++) {
          await new Promise((r) => setTimeout(r, 100));
          if (pendingSkinTestResultRowIdRef.current) return pendingSkinTestResultRowIdRef.current;
          try {
            const sid = sessionStorage.getItem(SKIN_RESULT_ROW_STORAGE);
            if (sid && SKIN_TEST_RESULT_ROW_UUID_RE.test(sid)) {
              pendingSkinTestResultRowIdRef.current = sid;
              void flushQueuedPersists();
              return sid;
            }
          } catch {
            /* ignore */
          }
        }
        return null;
      };

      const rowIdSelfie = await resolveRowIdForSelfie();
      if (supabase && userId && rowIdSelfie) {
        const { data: selfieRow, error: selfieUpErr } = await supabase
          .from('skin_test_results')
          .update({ selfie_analysis: selfiePersist })
          .eq('id', rowIdSelfie)
          .eq('user_id', userId)
          .select('id')
          .maybeSingle();
        if (selfieUpErr || !selfieRow?.id) {
          console.error('[SkinTest] selfie_analysis update:', selfieUpErr ?? '0 rows');
          pendingSelfiePersistRef.current = selfiePersist;
        }
      } else if (supabase && userId) {
        pendingSelfiePersistRef.current = selfiePersist;
      }

      /* 설문 문단을 셀피 수치·코멘트와 한 흐름으로 재생성 (실패 시 기존 aiAnalysisText 유지). ?type= 프로필 진입 후 셀피도 동일 */
      setPostSelfieUnifiedLoading(true);
      setAiRetrying(false);
      try {
        const pv = recommendedProductPreviewRef.current;
        const recName = pv?.status === 'ok' && pv.name?.trim() ? pv.name.trim() : '';
        const compHint =
          pv?.status === 'ok' && Array.isArray(pv.composition)
            ? pv.composition
                .slice(0, 5)
                .map((c) => c.product_type ?? c.name)
                .filter((v): v is string => !!v && String(v).trim().length > 0)
                .join(', ')
            : '';
        const concernMetricFocusSelfie = buildConcernMetricFocusForApi(profileData.concern, concernText || '');
        const customizedProducts =
          pv?.status === 'ok' && Array.isArray(pv.composition)
            ? pv.composition
                .filter((c) => c.is_customized)
                .slice(0, 3)
                .map((c) => ({
                  name: String(c.name ?? '').trim(),
                  product_type: String(c.product_type ?? '').trim(),
                  key_ingredients: String(c.key_ingredients ?? '').trim(),
                  is_customized: true,
                }))
                .filter((c) => c.name.length > 0)
            : [];
        const outputLang = isEn ? 'en' : 'ru';
        let uniParsed: AiAnalysisSections | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const uniRes = await fetch(`${skinApiBase}/analyze-text-with-selfie`, {
              method: 'POST',
              headers: skinApiHeaders,
              body: JSON.stringify({
                skin_type: result.type,
                concern_text: concernText || '',
                country,
                age_code: profileData.age ?? 'age_3',
                baumann_scores: result.scores,
                output_lang: outputLang,
                skin_metrics: payload.skin_metrics ?? {},
                gemini_selfie_en: payload.gemini_analysis?.en?.analysis ?? '',
                gemini_selfie_ru: payload.gemini_analysis?.ru?.analysis ?? '',
                gemini_selfie_ko: payload.gemini_analysis?.ko?.analysis ?? '',
                ...(recName ? { recommended_product_name: recName } : {}),
                ...(compHint ? { composition_product_types: compHint } : {}),
                ...(customizedProducts.length > 0 ? { customized_products: customizedProducts } : {}),
                ...(concernMetricFocusSelfie ? { concern_metric_focus: concernMetricFocusSelfie } : {}),
              }),
            });
            if (!uniRes.ok) throw new Error(`HTTP ${uniRes.status}`);
            const uni = (await uniRes.json()) as {
              success?: boolean;
              ko?: unknown;
              ru?: unknown;
              en?: unknown;
              sections?: unknown;
              output_lang?: unknown;
            };
            uniParsed = parseAiAnalysisApiPayload(uni);
            if (uniParsed) break;
            throw new Error('empty-ai-payload');
          } catch {
            if (attempt === 0) {
              setAiRetrying(true);
              await new Promise((r) => setTimeout(r, 600));
              continue;
            }
            throw new Error('analyze-text-with-selfie-failed');
          }
        }
        if (uniParsed) {
          setAiAnalysisText(uniParsed);
          setAiAnalysisError(null);
          const aiPersist = {
            en: uniParsed.en,
            ru: uniParsed.ru,
            ko: uniParsed.ko,
          };
          if (supabase && userId) {
            await persistAiAnalysisToRow(aiPersist);
          } else {
            pendingAiPersistRef.current = aiPersist;
          }
        } else {
          setAiAnalysisError(isEn ? 'AI analysis could not be generated.' : 'Не удалось сформировать AI-анализ.');
        }
      } catch (uErr) {
        console.warn('[SkinTest] analyze-text-with-selfie:', uErr);
        setAiAnalysisError(isEn ? 'AI analysis request failed.' : 'Ошибка запроса AI-анализа.');
      } finally {
        setAiRetrying(false);
        setPostSelfieUnifiedLoading(false);
      }

      const m = payload.skin_metrics ?? {};
      const currentComposite = Math.round(
        ((m.redness_index ?? 0) + (m.pigment_unevenness ?? 0) + (m.texture_roughness ?? 0) + (m.oiliness_index ?? 0)) / 4,
      );
      const baumannNeed = Math.max(0, result.scores[1]) + Math.max(0, result.scores[2]) + Math.max(0, result.scores[3]) + Math.max(0, result.scores[4]);
      const baseScore = Math.max(0, Math.min(100, 100 - baumannNeed * 10));

      // DB 저장(있으면): 월간 셀카 추적 스냅샷
      // 테이블 미생성 환경에서도 UX를 깨지 않도록 실패 시 무시한다.
      if (supabase) {
        try {
          const summaryText = isEn
            ? payload.gemini_analysis?.en?.analysis
            : payload.gemini_analysis?.ru?.analysis;
          const recommendations = [
            ...(recommendedProductPreview?.name ? [recommendedProductPreview.name] : []),
            ...((recommendedProductPreview?.composition ?? []).slice(0, 3).map((c) => c.name).filter((v): v is string => !!v)),
          ];
          await supabase.from('skin_progress_snapshots').insert({
            user_id: userId,
            cycle: 'monthly',
            base_score: baseScore,
            selfie_score: currentComposite,
            adjusted_score: Math.round((baseScore + currentComposite) / 2),
            summary: summaryText || (isEn ? 'Selfie analysis completed.' : 'Селфи-анализ выполнен.'),
            concerns: Array.isArray(result.info.concerns) ? result.info.concerns : [],
            recommendations,
            selfie_url: null,
          });
        } catch {
          /* optional table may not exist yet */
        }
      }

      const histKey = `semo_selfie_analysis_history:${userId}`;
      let prevComposite: number | null = null;
      try {
        const raw = localStorage.getItem(histKey);
        const arr = raw ? (JSON.parse(raw) as { at: string; score?: number }[]) : [];
        if (Array.isArray(arr) && arr.length > 0) {
          const n = Number(arr[arr.length - 1]?.score);
          if (Number.isFinite(n)) prevComposite = n;
        }
        const next = Array.isArray(arr) ? [...arr, { at: new Date().toISOString(), score: currentComposite }] : [{ at: new Date().toISOString(), score: currentComposite }];
        localStorage.setItem(histKey, JSON.stringify(next.slice(-12)));
      } catch {
        /* ignore */
      }
      if (prevComposite != null) {
        const delta = currentComposite - prevComposite;
        if (delta >= 4) {
          setSelfieComparisonComment(
            isEn
              ? 'Compared with your previous selfie analysis, skin stress appears higher. Reduce actives for 1-2 weeks and focus on soothing/barrier care.'
              : 'По сравнению с предыдущим селфи-анализом, стресс кожи выше. На 1-2 недели снизьте активы и сделайте акцент на успокаивающем и барьерном уходе.',
          );
        } else if (delta <= -4) {
          setSelfieComparisonComment(
            isEn
              ? 'Compared with your previous selfie analysis, overall condition looks improved. Keep routine consistency.'
              : 'По сравнению с предыдущим селфи-анализом, состояние улучшилось. Сохраняйте стабильность ухода.',
          );
        } else {
          setSelfieComparisonComment(
            isEn
              ? 'Compared with your previous selfie analysis, condition is relatively stable.'
              : 'По сравнению с предыдущим селфи-анализом, состояние относительно стабильное.',
          );
        }
      } else {
        setSelfieComparisonComment(null);
      }
      setSelfieFirstFlow(false);

      if (supabase) {
        const { data: consumeData, error: consumeErr } = await supabase.rpc('consume_selfie_coupon');
        if (consumeErr) {
          console.warn('[SkinTest] consume_selfie_coupon:', consumeErr);
        } else {
          const pack = consumeData as { ok?: boolean; balance?: number } | null;
          if (pack?.ok === true && typeof pack.balance === 'number') {
            setSelfieCouponCount(pack.balance);
          } else {
            setSelfieCouponCount(typeof pack?.balance === 'number' ? pack.balance : 0);
          }
        }
      }
    } catch (e) {
      setSelfieAnalyzeError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelfieAnalyzing(false);
    }
  };

  // ─── 인트로: 비회원 1회 허용, 2회째부터 가입 유도. 회원 2회 제한 ───
  const anonAlreadyUsed =
    typeof window !== 'undefined' &&
    !userId &&
    localStorage.getItem(`semo_anon_test_done:${getOrCreateVisitSessionId()}`) === '1';

  /** 로그인 + Supabase: 테스트 횟수 조회 전까지 인트로 분기(한도 화면) 판단 불가 → 로딩 */
  const skinLimitLoading = !!userId && !!supabase && testCount === null;

  if (stage === 'intro') {
    if (skinLimitLoading) {
      return (
        <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
          <SemoPageSpinner />
        </main>
      );
    }
    if (anonAlreadyUsed) {
      return (
        <main className="mx-auto flex min-h-[100dvh] flex-col bg-white px-4 py-5 sm:min-h-screen sm:px-6 sm:py-10 md:py-14">
          <div className="mx-auto w-full max-w-4xl">
            <header className="mb-12 text-center">
              <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
                {isEn ? 'Skin type test' : 'Тест типа кожи'}
              </h1>
              <p className="mt-4 text-lg text-slate-600">{isEn ? 'Without account, test is available once' : 'Без аккаунта тест можно пройти один раз'}</p>
            </header>
            <div className="px-1 text-center">
            <p className="text-center text-sm leading-snug text-slate-600 sm:text-base md:text-lg">
              {isEn ? 'You can take the test once without registration. Register to save the result and take it again.' : 'Тест можно пройти один раз без регистрации. Зарегистрируйтесь — результат сохранится и вы сможете пройти тест ещё раз.'}
            </p>
            <p className="mt-4 text-center text-base font-semibold text-brand sm:text-lg">
              {isEn ? 'Register now! Only 10 seconds!' : 'Зарегистрируйтесь! Всего 10 секунд!'}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/login"
                className="w-full max-w-xs rounded-full bg-brand py-3.5 text-center text-sm font-medium text-white transition hover:bg-brand/90 sm:py-4"
              >
                {isEn ? 'Register now! Only 10 seconds!' : 'Зарегистрироваться! Всего 10 секунд!'}
              </Link>
            </div>
            </div>
          </div>
        </main>
      );
    }
    if (userId && limitReached && !isAdmin) {
      return (
        <main className="mx-auto flex min-h-[100dvh] flex-col bg-white px-4 py-5 sm:min-h-screen sm:px-6 sm:py-10 md:py-14">
          <div className="mx-auto w-full max-w-4xl">
            <header className="mb-12 text-center">
              <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
                {isEn ? 'Skin type test' : 'Тест типа кожи'}
              </h1>
              <p className="mt-4 text-lg text-slate-600">{isEn ? 'Attempt limit reached for your account' : 'Лимит прохождений для вашего аккаунта'}</p>
            </header>
            <div className="px-1 text-center">
            <p className="text-center text-sm leading-snug text-slate-600 sm:text-base md:text-lg">
              {isEn ? 'You can take this test up to 2 times. Your saved results are in Profile.' : 'Тест можно пройти не более 2 раз. Ваши результаты — в разделе «Профиль».'}
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/profile"
                className="w-full max-w-xs rounded-full bg-brand py-3.5 text-center text-sm font-medium text-white transition hover:bg-brand/90 sm:py-4"
              >
                {isEn ? 'Go to profile' : 'В профиль'}
              </Link>
            </div>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="mx-auto w-full bg-white px-4 py-10 sm:px-6 sm:py-16 md:py-20">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-1 text-center sm:gap-10 sm:px-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
            {isEn ? 'Skin type test' : 'Тест типа кожи'}
          </h1>

          <p className="text-sm italic leading-relaxed text-slate-600 sm:text-base md:text-lg">
            {isEn ? (
              <>"Even expensive skincare is useless if it does not match your skin.<br />Take the test to avoid wasting money and get an expert care plan."</>
            ) : (
              <>
                «Даже дорогой уход бесполезен, если он не подходит вашей коже.»
                <br className="hidden md:block" />
                {' '}
                Пройдите тест, чтобы не тратить лишнего и получить экспертный план ухода!
              </>
            )}
          </p>

          {/* 회원/비회원 기능 차이 안내 */}
          <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-left sm:px-6">
            <div className="flex items-start gap-3">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
              <div>
                <p className="text-sm font-medium text-slate-700">
                  {isEn ? 'Without account' : 'Без аккаунта'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {isEn
                    ? 'Q&A skin type test only'
                    : 'Только тест-опросник для определения типа кожи'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex items-start gap-3 border-t border-slate-100 pt-3">
              <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <div>
                <p className="text-sm font-medium text-brand">
                  {isEn ? 'With account (free)' : 'С аккаунтом (бесплатно)'}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  {isEn
                    ? 'Q&A test + AI-powered detailed skin analysis using your selfie photo'
                    : 'Тест-опросник + детальный AI-анализ кожи на основе фотографии'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col items-center gap-3">
            <button
              type="button"
              onClick={handleAgree}
              className="w-full max-w-xs rounded-full border border-brand bg-white py-3 text-sm font-medium text-brand transition hover:bg-brand hover:text-white sm:py-3.5"
            >
              {isEn ? 'Agree and start' : 'Согласен(а) и начать'}
            </button>
            {!userId && (
              <Link
                to="/login"
                className="text-xs text-slate-400 hover:text-brand hover:underline"
              >
                {isEn ? 'Sign up for full analysis →' : 'Зарегистрироваться для полного анализа →'}
              </Link>
            )}
          </div>

          <p className="-mt-4 text-xs leading-relaxed text-slate-400 sm:-mt-5 sm:whitespace-nowrap">
            {isEn
              ? 'This is your expert guide for daily skincare. For specific medical conditions, please consult a doctor in addition to this test.'
              : 'Это ваш экспертный гид для ежедневного ухода. Для диагностики специфических заболеваний рекомендуем дополнить тест консультацией врача.'}
          </p>
        </div>
      </main>
    );
  }

  // ─── 프로필: 본 테스트와 동일 레이아웃(가운데·같은 위치·같은 간격) ───
  if (stage === 'profile') {
    const step = activeProfileSteps[profileStep];
    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-20 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            {isEn ? 'A few questions before test' : 'Несколько вопросов перед тестом'}
          </p>
          <p className="text-sm font-light leading-snug tracking-wide text-slate-800 sm:text-base sm:leading-relaxed">
            {step.label}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2.5 sm:mt-8 sm:gap-3">
            {step.options.map(([label, value]) => (
              <button
                key={`p${profileStep}-${value}`}
                type="button"
                onClick={() => handleProfileSelect(step.key, value)}
                className="touch-no-hover w-full max-w-xl rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-left text-sm text-slate-800 transition active:bg-slate-50 sm:py-3 sm:px-5 md:hover:border-brand md:hover:bg-brand-soft/20"
              >
                {label}
              </button>
            ))}
            {profileStep > 0 && (
              <button
                type="button"
                onClick={handleProfilePrev}
                className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:opacity-90 sm:mt-4"
              >
                <BackArrow />
                {isEn ? 'Previous step' : 'Предыдущий шаг'}
              </button>
            )}
          </div>
          <p className="mt-4 tabular-nums text-sm text-slate-500 sm:mt-5">
            {profileStep + 1}/{activeProfileSteps.length}
          </p>
        </div>
      </main>
    );
  }

  // ─── 피부 고민 자유 입력 ───
  if (stage === 'concern') {
    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-20 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            {isEn ? 'One last step' : 'Последний шаг'}
          </p>
          <p className="text-sm font-light leading-snug tracking-wide text-slate-800 sm:text-base sm:leading-relaxed">
            {isEn
              ? 'Tell us about your skin concerns in your own words'
              : 'Расскажите о своей коже своими словами'}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            {isEn
              ? 'Our AI will take your answer into account when creating personalised recommendations'
              : 'Наш AI учтёт ваш ответ при составлении персональных рекомендаций'}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:mt-8">
            <textarea
              rows={4}
              className="w-full max-w-xl rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/40 resize-none"
              placeholder={isEn
                ? 'e.g. My skin gets very dry in winter, I have occasional breakouts around my chin...'
                : 'Например: зимой кожа очень сохнет, иногда появляются высыпания на подбородке...'}
              value={concernText}
              onChange={(e) => setConcernText(e.target.value)}
            />
            <button
              type="button"
              onClick={handleConcernNext}
              className="w-full max-w-xl rounded-full bg-brand py-3 text-sm font-semibold text-white hover:bg-brand/90 active:bg-brand/80 sm:py-3.5"
            >
              {isEn ? 'Get my result →' : 'Получить результат →'}
            </button>
            <button
              type="button"
              onClick={handleConcernNext}
              className="text-sm text-slate-400 hover:text-slate-500"
            >
              {isEn ? 'Skip' : 'Пропустить'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ─── 테스트: 볼드 소제목, 괄호 숫자 제거·1/20은 답 밑, 간격 확대 ───
  if (stage === 'test') {
    const qText = activeQuestions[questionIndex];
    const current = questionIndex + 1;
    const total = activeQuestions.length;

    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-24 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          {/* 소제목: 주황·볼드, 괄호 숫자 없음 */}
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            {isEn ? 'SEMO skin type test' : 'Тест типа кожи SEMO'}
          </p>

          {/* 질문 — 소제목과 간격 넓힘 */}
          <p className="text-sm font-light leading-snug tracking-wide text-slate-800 sm:text-base sm:leading-relaxed">
            {qText}
          </p>
          {/* 답 항목 — 질문과 간격 넓힘 */}
          <div className="mt-6 flex flex-col items-center gap-2.5 sm:mt-8 sm:gap-3">
            {(() => {
              const q = QUESTIONS[questionIndex];
              const showSelection = isLastQuestion && answers.length === QUESTIONS.length;
              const currentScore = showSelection ? answers[answers.length - 1] : undefined;
              const selectedKey =
                currentScore !== undefined
                  ? ANSWERS.find(([, vk]) => (q?.reversed ? -SCORE_MAP[vk] : SCORE_MAP[vk]) === currentScore)?.[1] ?? null
                  : null;
              return activeAnswers.map(([label, valueKey]) => (
                <button
                  key={`q${questionIndex}-${valueKey}`}
                  type="button"
                  onClick={() => handleAnswer(valueKey)}
                  className={`w-full max-w-xl rounded-xl border py-3 px-4 text-left text-sm font-normal tracking-wide transition sm:py-3.5 sm:px-5 ${
                    showSelection && valueKey === selectedKey
                      ? 'border-brand bg-brand-soft/20 text-brand'
                      : 'touch-no-hover border-slate-200 bg-white text-slate-700 active:bg-slate-50 md:hover:border-brand md:hover:bg-brand-soft/10 md:hover:text-brand'
                  }`}
                >
                  {label}
                </button>
              ));
            })()}
            {isLastQuestion && answers.length === QUESTIONS.length && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // 로그인: 피부 고민 입력 단계 / 비로그인: 바로 결과
                  if (userId) {
                    setStage('concern');
                  } else {
                    handleFinalSubmit();
                  }
                }}
                className="mt-4 w-full max-w-xl rounded-full bg-brand py-3 text-sm font-semibold text-white hover:bg-brand/90 active:bg-brand/80 sm:mt-5 sm:py-3.5"
              >
                {isEn ? 'Next →' : 'Далее →'}
              </button>
            )}
            {/* 1/20 — 답 항목 밑 */}
            <p className="mt-4 tabular-nums text-sm text-slate-500 sm:mt-5">
              {current}/{total}
            </p>
            {/* 이전 질문으로: 1~20번 모두 표시 (1번에서는 disabled) */}
            <button
              type="button"
              onClick={handlePrev}
              className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:opacity-90 disabled:invisible sm:mt-3"
              disabled={questionIndex === 0}
            >
              <BackArrow />
              {isEn ? 'Previous question' : 'Предыдущий вопрос'}
            </button>
            {/* 테스트 전 단계로: 1번에서만 표시, 2~20번에서는 숨김 */}
            {questionIndex === 0 && (
              <button
                type="button"
                onClick={handleBackToProfile}
                className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:opacity-90 sm:mt-2"
              >
                <BackArrow />
                {isEn ? 'A few questions before test' : 'Несколько вопросов перед тестом'}
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ─── 결과: SKIN_INFO 기반 럭셔리 결과 화면 (화이트 & 오렌지) ───
  if (stage === 'result' && result) {
    const { type, info, scores } = result;
    const stateSummaryParagraph = buildSkinStateSummaryParagraph(
      scores,
      selfieAnalyzeResult?.skin_metrics ?? null,
      isEn,
      concernText,
    );
    const aiDisplaySections = aiAnalysisText
      ? pickDisplaySections(aiAnalysisText, isEn).filter((sec) => sec.title.trim() || sec.body.trim())
      : [];
    const waitingForAiSections = aiDisplaySections.length === 0 && (aiAnalysisLoading || postSelfieUnifiedLoading);
    const concernContext = submittedConcernContext ?? {
      profileCode: String(profileData.concern ?? '').trim(),
      freeText: String(concernText ?? '').trim(),
    };
    return (
      <main className="min-h-screen bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-4xl">
          {/* 상단 타입 뱃지 — 회색 bar 없음 (다른 페이지 소제목과 높이 맞춤) */}
          {!(userId && selfieFirstFlow) && <div>
            <p className="text-sm font-medium tracking-wide text-brand">
              {isEn ? 'Test result' : 'Результат теста'}
            </p>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {isEn ? `Your skin type: ${type}` : `Ваш тип кожи: ${type}`}
            </h1>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-x-6 sm:gap-y-2">
              <p className="min-w-0 flex-1 text-sm text-slate-500">
                {isEn ? englishTypeName(type) : info.name}
              </p>
              <div className="flex w-full min-w-0 flex-col items-stretch gap-1.5 sm:w-auto sm:shrink-0 sm:items-end sm:pl-2">
                <p className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 sm:text-right sm:text-[10px]">
                  {isEn ? 'Care focus' : 'Фокус ухода'}
                </p>
                {/* 한 줄 고정 — 좁은 화면은 가로 스크롤 */}
                <div className="flex w-full flex-nowrap justify-start gap-1.5 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:w-auto sm:max-w-[min(100vw-2rem,42rem)] sm:justify-end">
                  {(Array.isArray(info.concerns) ? info.concerns : []).map((c) => (
                    <span
                      key={c}
                      className="shrink-0 whitespace-nowrap rounded-full border border-brand/30 bg-brand-soft/30 px-2 py-0.5 text-[10px] leading-snug text-slate-700 sm:px-2.5 sm:py-1 sm:text-[11px]"
                    >
                      {isEn ? englishConcernLabel(c) : c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>}

          {!(userId && selfieFirstFlow) && (
            <SkinResultMetricsCharts
              scores={scores}
              skinMetrics={selfieAnalyzeResult?.skin_metrics ?? null}
              isEn={isEn}
              concernProfileCode={concernContext.profileCode}
              concernFreeText={concernContext.freeText}
              ageCode={profileData.age ?? undefined}
            />
          )}

          {/* AI 준비 전에는 폴백 카드 대신 로딩 안내만 노출 */}
          {!(userId && selfieFirstFlow) && waitingForAiSections && (
            <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/30 px-3 py-3 sm:px-4 sm:py-4">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">
                {isEn ? 'Analysis in progress' : 'Идёт анализ'}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {isEn
                  ? 'Generating your personalized result now. This may take 1-2 minutes.'
                  : 'Формируем персональный результат. Это может занять 1-2 минуты.'}
              </p>
              {aiRetrying && (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {isEn
                    ? 'Network signal looks weak, retrying once now...'
                    : 'Сигнал сети выглядит слабым, пробуем ещё раз...'}
                </p>
              )}
            </div>
          )}

          {/* AI 분석 섹션 */}
          {!(userId && selfieFirstFlow) && <div className="mt-3 space-y-3">
            {aiAnalysisText && aiDisplaySections.length > 0 ? (
              <>
                {aiDisplaySections.map((sec, idx) => {
                  const isLast = idx === aiDisplaySections.length - 1;
                  const KICKERS_RU = ['\u0412\u0430\u0448\u0430 \u043a\u043e\u0436\u0430 \u0441\u0435\u0439\u0447\u0430\u0441', '\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u043c\u044b\u0439 \u0443\u0445\u043e\u0434', '\u041e\u0436\u0438\u0434\u0430\u0435\u043c\u044b\u0439 \u044d\u0444\u0444\u0435\u043a\u0442 \u043e\u0442 \u0441\u0440\u0435\u0434\u0441\u0442\u0432'];
                  const KICKERS_EN = ['Your skin right now', 'Recommended routine', 'Expected results'];
                  const kicker = (isEn ? KICKERS_EN : KICKERS_RU)[idx] ?? (isEn ? KICKERS_EN[KICKERS_EN.length - 1] : KICKERS_RU[KICKERS_RU.length - 1]);
                  return (
                    <div
                      key={`ai-sec-${idx}-${String(sec.title ?? '').slice(0, 12)}`}
                      className="rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-3 sm:px-4 sm:py-4"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{kicker}</p>
                      <div className="mt-2 space-y-2">
                        {String(sec.body || '')
                          .split(/\n\s*\n/g)
                          .map((para) => para.trim())
                          .filter(Boolean)
                          .map((para, pIdx) => (
                            <p key={`sec-${idx}-p-${pIdx}`} className="text-sm leading-relaxed text-slate-700">
                              {para}
                            </p>
                          ))}
                      </div>
                      {idx === 0 && (
                        <p className="mt-2 text-[11px] leading-snug text-slate-400">
                          {isEn
                            ? 'This reflects skin tendencies, not a medical diagnosis.'
                            : 'Это профиль тенденций, а не медицинский диагноз.'}
                        </p>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (!waitingForAiSections && aiAnalysisError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-3 sm:px-4 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">
                  {isEn ? 'Analysis failed' : 'Ошибка анализа'}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-rose-700">
                  {aiAnalysisError}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-brand/20 bg-brand-soft/30 px-3 py-3 sm:px-4 sm:py-4">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">
                  {isEn ? 'Analysis in progress' : 'Идёт анализ'}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {isEn
                    ? 'Preparing your final personalized result...'
                    : 'Подготавливаем ваш персональный результат...'}
                </p>
                {aiRetrying && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {isEn
                      ? 'Network signal looks weak, retrying once now...'
                      : 'Сигнал сети выглядит слабым, пробуем ещё раз...'}
                  </p>
                )}
              </div>
            ))}
          </div>}

          {/* ── 셀카 업로드 박스: 최초 분석 전/셀피 우선 단계에서만 노출 ── */}
          {userId && selfieCouponCount !== null && (selfieFirstFlow || !selfieAnalyzeResult) && (
            <div className={selfieFirstFlow ? 'mx-auto mt-0 w-full max-w-4xl' : 'mt-3'}>
              {selfieCouponCount > 0 && !selfieOpen ? (
                <div className="rounded-xl border border-brand/20 bg-brand-soft/25 px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold tracking-wide text-brand">
                      {isEn ? 'Selfie-based analysis' : 'Анализ по селфи'}
                    </p>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200/80">
                      {isEn
                        ? `${selfieCouponCount} coupon${selfieCouponCount > 1 ? 's' : ''} left`
                        : `Купонов: ${selfieCouponCount}`}
                    </span>
                  </div>

                  <p className="mt-2 text-sm leading-relaxed text-slate-700">
                    {isEn
                      ? 'Get a more detailed skin diagnosis with one selfie upload.'
                      : 'Получите более детальный анализ кожи на основе селфи.'}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {isEn
                      ? 'Adds photo signals for redness, tone unevenness, texture and T-zone shine.'
                      : 'Добавляет фото-сигналы по покраснению, неровности тона, текстуре и блеску T-зоны.'}
                  </p>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setSelfieOpen(true)}
                      className="inline-flex items-center rounded-full border border-brand/25 bg-white px-3 py-1.5 text-xs font-medium text-brand transition hover:bg-brand hover:text-white"
                    >
                      {isEn ? 'Get selfie-based analysis' : 'Получить анализ по селфи'}
                    </button>
                  </div>
                </div>
              ) : selfieCouponCount > 0 ? (
                <div className="rounded-xl border border-brand/20 bg-brand-soft/25 px-4 py-5 sm:px-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-medium tracking-wide text-brand">
                      {isEn ? 'Skin deep-scan' : 'Детальный анализ кожи'}
                    </p>
                    <button type="button" onClick={() => setSelfieOpen(false)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-700">
                    {isEn
                      ? 'Semo AI reads your photo for redness, tone unevenness, texture and T-zone shine and adds them to the chart above—signals depend on lighting and angle.'
                      : 'Semo AI оценивает по фото покраснение, неровность тона, текстуру и блеск T-зоны и отражает это на диаграмме выше — сигналы зависят от света и ракурса.'}
                  </p>

                  {selfieCouponNotice && (
                    <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">{selfieCouponNotice}</p>
                  )}
                  <p className="mt-1.5 text-xs text-slate-500">
                    {isEn
                      ? 'Upon registration, you receive a coupon for a detailed selfie-based skin analysis.'
                      : 'При регистрации вы получаете купон на детальный анализ кожи на основе селфи.'}
                  </p>

                  {/* 좋은 예 + (선택) 내 사진 미리보기 + 체크리스트 — 미리보기는 가이드와 동일 폭 */}
                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
                    <div className="flex shrink-0 flex-row gap-3 sm:gap-4">
                      <div className="w-36 shrink-0 sm:w-44">
                        <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
                          <img
                            src="/selfie-guide-example.png"
                            alt={isEn ? 'Good selfie example' : 'Пример хорошего селфи'}
                            className="h-full w-full object-cover object-center"
                          />
                          <div
                            className="absolute left-0 right-0 backdrop-blur-md"
                            style={{ top: '32%', height: '13%', background: 'rgba(30,20,15,0.55)' }}
                          />
                        </div>
                        <p className="mt-2 text-center text-[10px] font-semibold text-emerald-600">
                          {isEn ? '✓ Good example' : '✓ Хороший пример'}
                        </p>
                        <p className="mt-0.5 text-center text-[9px] leading-snug text-slate-400">
                          {isEn ? 'AI-generated sample image' : 'Пример сгенерирован ИИ'}
                        </p>
                      </div>
                      {selfiePreviewUrl ? (
                        <div className="w-36 shrink-0 sm:w-44">
                          <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-brand/25 ring-1 ring-brand/10">
                            <img src={selfiePreviewUrl} alt="" className="h-full w-full object-cover object-center" />
                          </div>
                          <p className="mt-2 text-center text-[10px] font-semibold text-slate-600">
                            {isEn ? 'Your photo' : 'Ваше фото'}
                          </p>
                          {selfiePrecheckWarning && (
                            <p className="mt-1 whitespace-pre-line text-center text-[10px] leading-snug text-red-600">
                              {selfiePrecheckWarning}
                            </p>
                          )}
                          {selfieAnalyzeWarning && (
                            <p className="mt-1 whitespace-pre-line text-center text-[10px] leading-snug text-red-600">
                              {selfieAnalyzeWarning}
                            </p>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className="hidden w-px shrink-0 self-stretch bg-brand/10 sm:block" />
                    <ul className="flex min-w-0 flex-1 flex-col justify-center space-y-2 text-xs leading-relaxed text-slate-600">
                      {(isEn ? [
                        '✅ Bright room, no window behind you',
                        '✅ 15–30 min after cleansing, before skincare',
                        '✅ 30–50 cm away, eye level',
                        '✅ No makeup, no serum or moisturiser',
                        '✅ Hair back, glasses off',
                        '❌ No filters or beauty mode',
                      ] : [
                        '✅ Яркая комната, окно не за спиной',
                        '✅ Через 15–30 мин после умывания, до косметики',
                        '✅ 30–50 см, на уровне глаз',
                        '✅ Без макияжа, сыворотки и крема',
                        '✅ Волосы убраны, очки сняты',
                        '❌ Без фильтров и режима красоты',
                      ]).map((tip, i) => <li key={i}>{tip}</li>)}
                    </ul>
                  </div>

                  {/* 동의 체크박스 */}
                  <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-brand/10 pt-4">
                    <input
                      type="checkbox"
                      checked={selfieConsent}
                      onChange={(e) => setSelfieConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                    />
                    <span className="text-xs leading-relaxed text-slate-500 sm:whitespace-nowrap">
                      {isEn
                        ? 'I consent to my photo being processed for skin analysis only. Not shared with third parties and deleted after analysis.'
                        : 'Я согласен(на) на обработку фото для анализа кожи. Не передаётся третьим лицам и удаляется после анализа.'}
                    </span>
                  </label>

                  {/* 갤러리/카메라용 숨김 input — 데스크톱 라벨은 htmlFor로 갤러리만 연결 */}
                  <input
                    id="semo-skin-selfie-gallery"
                    ref={galleryInputRef}
                    type="file"
                    accept="image/*"
                    disabled={!selfieConsent}
                    onChange={onSelfieFilePicked}
                    className="hidden"
                    aria-hidden
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    disabled={!selfieConsent}
                    onChange={onSelfieFilePicked}
                    className="hidden"
                    aria-hidden
                  />

                  {/* 업로드 + 분석 — 한 줄 (모바일: 업로드 탭 시 갤러리/셀카 선택) */}
                  <div className="mt-3 flex flex-row gap-2 sm:gap-3">
                    <div ref={selfieUploadWrapRef} className="relative min-w-0 flex-1">
                      <label
                        htmlFor="semo-skin-selfie-gallery"
                        className={`hidden min-h-[44px] w-full cursor-pointer items-center justify-center rounded-full border px-2 py-2.5 text-center text-xs font-medium leading-tight transition sm:text-sm md:flex ${
                          selfieConsent
                            ? 'border-brand bg-white text-brand hover:bg-brand/5'
                            : 'pointer-events-none cursor-not-allowed border-slate-200 text-slate-300'
                        }`}
                      >
                        {isEn ? 'Upload photo' : 'Загрузить фото'}
                      </label>

                      <button
                        type="button"
                        disabled={!selfieConsent}
                        onClick={() => selfieConsent && setSelfieUploadMenuOpen((o) => !o)}
                        className={`flex min-h-[44px] w-full items-center justify-center rounded-full border px-2 py-2.5 text-center text-xs font-medium leading-tight transition sm:text-sm md:hidden ${
                          selfieConsent
                            ? 'border-brand bg-white text-brand hover:bg-brand/5'
                            : 'cursor-not-allowed border-slate-200 text-slate-300'
                        }`}
                      >
                        {isEn ? 'Upload photo' : 'Загрузить фото'}
                      </button>

                      {selfieUploadMenuOpen ? (
                        <div
                          className="absolute left-0 right-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg md:hidden"
                          role="menu"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            className="px-3 py-2.5 text-left text-xs font-medium text-slate-800 hover:bg-slate-50"
                            onClick={() => galleryInputRef.current?.click()}
                          >
                            {isEn ? 'Choose from gallery' : 'Выбрать из галереи'}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="px-3 py-2.5 text-left text-xs font-medium text-slate-800 hover:bg-slate-50"
                            onClick={() => cameraInputRef.current?.click()}
                          >
                            {isEn ? 'Take selfie' : 'Сфотографироваться'}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleSelfieAnalyze()}
                      disabled={
                        selfieAnalyzing ||
                        selfieCouponCount == null ||
                        selfieCouponCount <= 0 ||
                        !selfieFile ||
                        !selfieConsent
                      }
                      className="min-h-[44px] min-w-0 flex-1 rounded-full border border-brand bg-brand px-2 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-brand/90 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:text-sm"
                    >
                      {selfieAnalyzing
                        ? isEn
                          ? 'Analysing…'
                          : 'Анализируем…'
                        : isEn
                          ? 'Analyse'
                          : 'Анализ'}
                    </button>
                  </div>
                  {selfieAnalyzeError && <p className="mt-2 text-xs text-red-500">{selfieAnalyzeError}</p>}

                  {selfieAnalyzeResult?.gemini_analysis && (
                    <div className="mt-4 border-t border-brand/10 pt-4">
                      <p className="mb-1.5 text-sm font-medium tracking-wide text-brand">
                        {isEn ? '🧬 AI deep analysis' : '🧬 AI-анализ'}
                      </p>
                      <p className="text-sm leading-relaxed text-slate-700">
                        {isEn ? selfieAnalyzeResult.gemini_analysis.en?.analysis : selfieAnalyzeResult.gemini_analysis.ru?.analysis}
                      </p>
                    </div>
                  )}

                </div>
              ) : null}
              {selfieFirstFlow && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setSelfieFirstFlow(false)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    {isEn ? 'Skip' : 'Пропустить'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Персональный выбор SEMO */}
          {!(userId && selfieFirstFlow) && <div className="mt-3 rounded-xl border border-brand/20 bg-brand-soft/25 px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
            <p className="text-sm font-medium tracking-wide text-brand">
              {recommendedProductPreview?.status === 'ok' && recommendedProductPreview.name?.trim()
                ? (isEn ? `SEMO personal pick: ${recommendedProductPreview.name.trim()}` : `Персональный выбор SEMO : ${recommendedProductPreview.name.trim()}`)
                : (isEn ? 'SEMO personal pick' : 'Персональный выбор SEMO')}
            </p>
            {recommendedProductPreview?.status === 'no_slot' && (
              <p className="mt-2 text-xs leading-snug text-slate-600 sm:text-sm">
                {isEn
                  ? 'Recommended product not found. In admin, check catalog slots for '
                  : 'Рекомендуемый товар не найден. В админке проверьте слоты каталога '}
                <span className="whitespace-nowrap">Beauty box</span>
                {isEn ? ': there must be at least as many rows as the slot number' : ': должно быть не меньше строк, чем номер слота для'}
                {isEn
                  ? ' and slot mapping for your skin type.'
                  : 'вашего типа кожи (например, для 4-го слота — четыре товара в сетке), и привязку типа кожи к слоту.'}
              </p>
            )}
            {recommendedProductPreview?.status === 'fetch_failed' && (
              <p className="mt-2 text-xs leading-snug text-amber-800/90 sm:text-sm">
                {isEn ? 'Could not load product card. Refresh page or check catalog access settings.' : 'Не удалось загрузить карточку товара. Обновите страницу или проверьте настройки доступа к каталогу.'}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              {[1, 2].map((n) => {
                const url = n === 1 ? recommendedProductPreview?.thumb1 : recommendedProductPreview?.thumb2;
                const st = recommendedProductPreview?.status;
                const emptyLabel =
                  recommendedProductPreview === null
                    ? (isEn ? 'Loading...' : 'Загрузка...')
                    : st === 'no_slot'
                      ? '—'
                      : st === 'fetch_failed'
                        ? '—'
                        : n === 1
                          ? (isEn ? 'No image' : 'Нет фото')
                          : '—';
                return (
                  <div key={n} className="flex flex-col items-center">
                    <div className="relative aspect-[4/3] w-full max-w-[220px] overflow-hidden rounded-xl bg-slate-100 sm:max-w-none">
                      {url ? (
                        <img
                          src={url}
                          alt={recommendedProductPreview?.name?.trim() || 'Beauty box'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-slate-400">
                          {emptyLabel}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {recommendedProductPreview && recommendedProductPreview.composition.length > 0 && (
              <ProductCompositionGrid
                className="mt-5"
                components={recommendedProductPreview.composition}
                tighterMobileComposeTitle
                parentProductId={recommendedProductPreview.productId}
              />
            )}
          </div>}


          {/* CTA 섹션 */}
          {!(userId && selfieFirstFlow) && <div className="mt-10 flex flex-col items-center gap-4">

            {/* ── 비로그인: 회원가입 유도 배너 ── */}
            {!userId && (
              <div className="w-full max-w-2xl rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft/30 to-orange-50 p-5 text-center">
                <p className="text-base font-semibold text-slate-800">
                  {isEn
                    ? '✨ Want a deeper analysis?'
                    : '✨ Хотите более точный анализ?'}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {isEn
                    ? 'Sign up and upload your selfie for a richer AI read—photo signals on the chart, personalised product angles, and progress-friendly notes.'
                    : 'Зарегистрируйтесь и загрузите селфи — расширенный AI-разбор, фото-шкалы на диаграмме, персональные акценты по уходу и заметки для отслеживания динамики.'}
                </p>
                <Link
                  to="/login"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90"
                >
                  {isEn ? 'Sign up free →' : 'Зарегистрироваться бесплатно →'}
                </Link>
              </div>
            )}


            {/* 상품 보기 / 장바구니 버튼 */}
            <div className="mx-auto flex w-full max-w-md flex-row items-stretch justify-center gap-2 sm:max-w-lg sm:gap-3">
              <Link
                to={getRecommendationPath(result.type)}
                className={`inline-flex min-h-11 items-center justify-center rounded-full border border-brand bg-white px-3 py-2.5 text-center text-xs font-medium text-brand transition hover:bg-brand-soft/25 sm:px-4 sm:text-sm ${
                  canAddRecommendedToCart ? 'min-w-0 flex-1 basis-0' : 'w-full max-w-[240px]'
                }`}
              >
                {isEn ? 'View products' : 'Смотреть товары'}
              </Link>
              {canAddRecommendedToCart && (
                <button
                  type="button"
                  onClick={handleAddRecommendedToCart}
                  className="inline-flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center rounded-full border border-transparent bg-brand px-3 py-2.5 text-center text-xs font-medium text-white transition hover:bg-brand/90 sm:px-4 sm:text-sm"
                >
                  {isEn ? 'Add to cart' : 'В корзину'}
                </button>
              )}
            </div>
          </div>}

          {cartToast && (
            <div
              className="fixed left-1/2 z-50 max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg max-md:bottom-[calc(var(--semo-mobile-tabbar-h)+0.5rem)] md:bottom-8"
              role="status"
            >
              {isEn ? 'Added to cart' : 'Добавлен в корзину'}
            </div>
          )}
          {selfieAnalyzing && (
            <div
              className="fixed left-1/2 top-1/2 z-50 w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg"
              role="status"
              aria-live="polite"
            >
              {isEn
                ? 'Analysing your selfie. This can take up to 1-2 minutes.'
                : 'Идёт анализ фото. Это может занять до 1-2 минут.'}
            </div>
          )}
        </div>
      </main>
    );
  }

  if (stage === 'result' && !result) {
    return (
      <main className="mx-auto min-h-[40dvh] max-w-lg bg-white px-4 py-12 text-center">
        <p className="text-slate-700">결과 데이터가 없습니다. 테스트를 처음부터 다시 열어 주세요.</p>
        <button
          type="button"
          className="mt-6 rounded-full bg-brand px-5 py-2 text-sm font-medium text-white"
          onClick={() => {
            window.location.href = '/skin-test';
          }}
        >
          스킨 테스트 다시 열기
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[40dvh] max-w-lg bg-white px-4 py-12 text-center">
      <p className="text-slate-700">화면을 표시할 수 없습니다.</p>
      <button
        type="button"
        className="mt-4 rounded-full border border-brand px-5 py-2 text-sm font-medium text-brand"
        onClick={() => window.location.reload()}
      >
        새로고침
      </button>
    </main>
  );
};
