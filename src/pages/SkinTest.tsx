import React, { useState, useEffect, useLayoutEffect } from 'react';
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

const MAX_TEST_COUNT = 2;
const SKIN_API_URL = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SKIN_API_URL ?? 'http://localhost:5001';

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
const ADMIN_EMAILS = ['admin@semo-box.ru', 'admin@semo-beautybox.com'];
/** 테스트 횟수 제한 없음 (해당 이메일만) */
const UNLIMITED_TEST_EMAILS = ['dvanovic91@gmail.com'];

type Stage = 'intro' | 'profile' | 'concern' | 'test' | 'result';
type SelfieAnalyzeResponse = {
  error?: boolean;
  message?: string;
  retake_required?: boolean;
  message_ru?: string;
  skin_metrics?: {
    redness_index?: number;
    pigment_unevenness?: number;
    texture_roughness?: number;
    oiliness_index?: number;
  };
  gemini_analysis?: {
    ko?: { analysis?: string };
    en?: { analysis?: string };
    ru?: { analysis?: string };
  };
};

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
  { key: 'city', label: 'Your city?', options: [['Moscow region', 'city_1'], ['Saint Petersburg region', 'city_2'], ['Novosibirsk', 'city_3'], ['Yekaterinburg', 'city_4'], ['Kazan', 'city_5'], ['Nizhny Novgorod', 'city_6'], ['Chelyabinsk', 'city_7'], ['Samara', 'city_8'], ['Other city', 'city_9']] as [string, string][] },
  { key: 'concern', label: 'Main skin concern?', options: [['Acne and breakouts', 'con_1'], ['Dryness and flaking', 'con_2'], ['Pigmentation and uneven tone', 'con_3'], ['Aging signs', 'con_4'], ['Excess oil shine', 'con_5']] as [string, string][] },
  { key: 'routine', label: 'How would you describe your skin routine?', options: [['Almost none', 'rut_1'], ['Basic routine only', 'rut_2'], ['Full routine', 'rut_3']] as [string, string][] },
  { key: 'source', label: 'How did you hear about us?', options: [['Instagram / Social media', 'src_ig'], ['Friend recommendation', 'src_friend'], ['Yandex search', 'src_yandex'], ['Marketplaces', 'src_market'], ['Other', 'src_other']] as [string, string][] },
] as const;

/** 프로필 다음 단계 */
function nextProfileStep(step: number): number {
  return step + 1;
}

export const SkinTest: React.FC = () => {
  const { language, currency } = useI18n();
  const isEn = language === 'en';
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

  const [searchParams] = useSearchParams();
  const { addItem } = useCart();
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);
  const noTestLimit = !!userEmail && UNLIMITED_TEST_EMAILS.includes(userEmail);
  const [stage, setStage] = useState<Stage>('intro');
  const [testCount, setTestCount] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [concernText, setConcernText] = useState('');
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
  const [cartToast, setCartToast] = useState(false);
  const [prevResultSkinType, setPrevResultSkinType] = useState<string | null>(null);
  const [prevResultAt, setPrevResultAt] = useState<string | null>(null);
  const [selfieCouponCount, setSelfieCouponCount] = useState(0);
  const [selfieCouponNotice, setSelfieCouponNotice] = useState<string | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreviewUrl, setSelfiePreviewUrl] = useState<string | null>(null);
  const [selfieAnalyzing, setSelfieAnalyzing] = useState(false);
  const [selfieAnalyzeError, setSelfieAnalyzeError] = useState<string | null>(null);
  const [selfieAnalyzeResult, setSelfieAnalyzeResult] = useState<SelfieAnalyzeResponse | null>(null);
  const [selfieComparisonComment, setSelfieComparisonComment] = useState<string | null>(null);

  /** 프로필 «Посмотреть результат теста» → ?type=DSNW 등: 동일 결과지 UI */
  useLayoutEffect(() => {
    const raw = searchParams.get('type')?.trim().toUpperCase();
    if (!raw || !SKIN_INFO[raw]) return;
    setResult({
      type: raw,
      info: SKIN_INFO[raw],
      scores: approximateScoresFromSkinTypeCode(raw),
    });
    setStage('result');
  }, [searchParams]);

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

  /** 회원가입/로그인 사용자: 정밀 셀카 분석 쿠폰(로컬 1장) 1회 지급 */
  useEffect(() => {
    if (!userId || typeof window === 'undefined') {
      setSelfieCouponCount(0);
      setSelfieCouponNotice(null);
      return;
    }
    try {
      const awardedKey = `semo_selfie_coupon_awarded:${userId}`;
      const remainKey = `semo_selfie_coupon_remaining:${userId}`;
      const awarded = localStorage.getItem(awardedKey) === '1';
      if (!awarded) {
        localStorage.setItem(awardedKey, '1');
        localStorage.setItem(remainKey, '1');
        setSelfieCouponCount(1);
        setSelfieCouponNotice(
          isEn
            ? 'Welcome coupon issued: 1 detailed selfie analysis.'
            : 'Приветственный купон выдан: 1 детальный селфи-анализ.',
        );
        return;
      }
      const n = parseInt(localStorage.getItem(remainKey) ?? '0', 10);
      setSelfieCouponCount(Number.isFinite(n) ? Math.max(0, n) : 0);
      setSelfieCouponNotice(null);
    } catch {
      setSelfieCouponCount(0);
      setSelfieCouponNotice(null);
    }
  }, [userId, isEn]);

  useEffect(() => {
    return () => {
      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
    };
  }, [selfiePreviewUrl]);

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

        let composition: ProductCompositionItem[] = [];
        try {
          const { data: compRows } = await supabase
            .from('product_components')
            .select('id, sort_order, name, image_url, image_urls, description, is_customized, sku_items(display_name, description, image_url, key_ingredients)')
            .eq('product_id', productId);
          if (Array.isArray(compRows)) {
            composition = (compRows as any[])
              .slice()
              .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((c: any) => {
                const sku = c.sku_items as { display_name?: string | null; description?: string | null; image_url?: string | null; key_ingredients?: string | null } | null;
                // sku_id가 연결된 경우 SKU 데이터 우선 사용
                const hasSkuImage = !!sku?.image_url;
                return {
                  id: c.id,
                  name: (sku?.display_name) ? sku.display_name : c.name,
                  image_url: hasSkuImage ? sku.image_url : c.image_url,
                  image_urls: hasSkuImage ? [sku!.image_url!] : (c.image_urls ?? null),
                  description: (sku?.description) ? sku.description : (c.description || null),
                };
              });
          }
        } catch {
          composition = [];
        }

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
  }, [result?.type]);

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
    if (profileStep + 1 >= PROFILE_STEPS.length) {
      // 마지막 프로필 단계 → 피부 고민 텍스트 입력 단계로
      setStage('concern');
    } else {
      setProfileStep(nextProfileStep(profileStep));
    }
  };

  const handleConcernNext = () => {
    setStage('test');
    setQuestionIndex(0);
    setAnswers([]);
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
    if (answers.length !== QUESTIONS.length) return;
    const { type, scores } = calcSkinType(answers);
    const info = SKIN_INFO[type] ?? {
      name: type,
      desc: isEn ? 'Test result saved.' : 'Результат теста сохранён.',
      concerns: [] as string[],
      avoid: '',
    };
    setResult({ type, info, scores });
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
        supabase.from('skin_test_results').insert({ user_id: userId, skin_type: type, concern_text: concernText || null }).then(() => {
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
    if (selfieCouponCount <= 0) {
      setSelfieAnalyzeError(isEn ? 'No selfie-analysis coupon left.' : 'Купон на селфи-анализ закончился.');
      return;
    }
    if (!selfieFile) {
      setSelfieAnalyzeError(isEn ? 'Upload selfie first.' : 'Сначала загрузите селфи.');
      return;
    }
    setSelfieAnalyzing(true);
    setSelfieAnalyzeError(null);
    try {
      const fd = new FormData();
      fd.append('image', selfieFile);
      fd.append('bauman_type', result.type);
      fd.append('bauman_scores', JSON.stringify(result.scores));
      fd.append('region', cityToRegionCode[profileData.city ?? 'city_1'] ?? 'moscow');
      fd.append('age_code', profileData.age ?? 'age_3');
      fd.append('user_id', userId);
      fd.append('skin_concern', concernText || '');
      const res = await fetch(`${SKIN_API_URL}/analyze`, { method: 'POST', body: fd });
      const payload = (await res.json()) as SelfieAnalyzeResponse;
      if (!res.ok || payload.error) throw new Error(payload.message || (isEn ? 'Selfie analysis failed.' : 'Селфи-анализ не выполнен.'));
      if (payload.retake_required) throw new Error(payload.message_ru || (isEn ? 'Please retake selfie.' : 'Нужно переснять селфи.'));
      setSelfieAnalyzeResult(payload);

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
            concerns: info.concerns ?? [],
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
        const arr = raw ? (JSON.parse(raw) as { at: string; score: number }[]) : [];
        if (Array.isArray(arr) && arr.length > 0) prevComposite = Number(arr[arr.length - 1].score);
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

      try {
        const remainKey = `semo_selfie_coupon_remaining:${userId}`;
        const current = parseInt(localStorage.getItem(remainKey) ?? '0', 10);
        const next = Math.max(0, (Number.isFinite(current) ? current : 0) - 1);
        localStorage.setItem(remainKey, String(next));
        setSelfieCouponCount(next);
      } catch {
        setSelfieCouponCount((c) => Math.max(0, c - 1));
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
      <main className="mx-auto w-full bg-white px-4 py-5 sm:px-6 sm:py-10 md:py-14">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center space-y-5 px-1 text-center sm:space-y-6 sm:px-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
            {isEn ? 'Skin type test' : 'Тест типа кожи'}
          </h1>
          <p className="text-sm italic leading-snug text-slate-600 break-words sm:text-base sm:leading-relaxed md:text-lg">
            {isEn
              ? '"Even expensive skincare is useless if it does not match your skin. Take the test to avoid wasting money and get an expert care plan."'
              : '«Даже дорогой уход бесполезен, если он не подходит вашей коже. Пройдите тест, чтобы не тратить лишнего и получить экспертный план ухода!»'}
          </p>
          <p className="text-xs leading-snug text-slate-400 break-words sm:text-sm sm:leading-relaxed">
            {isEn
              ? 'This is your expert guide for daily skincare. For specific medical conditions, please consult a doctor in addition to this test.'
              : 'Это ваш экспертный гид для ежедневного ухода. Для диагностики специфических заболеваний рекомендуем дополнить тест консультацией врача.'}
          </p>
          <div className="flex w-full flex-col items-center">
            <button
              type="button"
              onClick={handleAgree}
              className="w-full max-w-xs rounded-full border border-brand bg-white py-3 text-sm font-medium text-brand transition hover:bg-brand hover:text-white sm:py-3.5 md:py-4"
            >
              {isEn ? 'Agree and start' : 'Согласен(а) и начать'}
            </button>
          </div>
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
            {isEn ? 'A few questions before test' : 'Несколько вопросов перед тестом'}
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
              {isEn ? 'Next →' : 'Далее →'}
            </button>
            <button
              type="button"
              onClick={handleConcernNext}
              className="text-sm text-slate-400 hover:text-slate-500"
            >
              {isEn ? 'Skip' : 'Пропустить'}
            </button>
          </div>
          <p className="mt-4 tabular-nums text-sm text-slate-500 sm:mt-5">
            {PROFILE_STEPS.length + 1}/{PROFILE_STEPS.length + 1}
          </p>
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
              const showSelection = isLastQuestion && answers.length === QUESTIONS.length;
              const currentScore = showSelection ? answers[answers.length - 1] : undefined;
              const selectedKey =
                currentScore !== undefined
                  ? ANSWERS.find(([, vk]) => (q.reversed ? -SCORE_MAP[vk] : SCORE_MAP[vk]) === currentScore)?.[1] ?? null
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
                  handleFinalSubmit();
                }}
                className="mt-4 w-full max-w-xl rounded-full bg-brand py-3 text-sm font-semibold text-white hover:bg-brand/90 active:bg-brand/80 sm:mt-5 sm:py-3.5"
              >
                {isEn ? 'Finish test' : 'Завершить тест'}
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
    return (
      <main className="min-h-screen bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-4xl">
          {/* 상단 타입 뱃지 — 회색 bar 없음 (다른 페이지 소제목과 높이 맞춤) */}
          <div>
            <p className="text-sm font-medium tracking-wide text-brand">
              {isEn ? 'Test result' : 'Результат теста'}
            </p>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {isEn ? `Your skin type: ${type}` : `Ваш тип кожи: ${type}`}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{isEn ? englishTypeName(type) : info.name}</p>
          </div>

          {/* 설명 — 타입 부제목과 간격 절반(mt-10→mt-5), 블록 패딩 절반(py-6→py-3) */}
          <div className="mt-5 py-3">
            <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
              {isEn
                ? englishResultDesc(type)
                : info.desc.replace(/\s*[\u2728\u{1F31F}\u{1F338}\u{1F4AB}\u{1F3C6}\u{1F33F}]+\s*$/gu, '').trim()}
            </p>
          </div>

          {/* Персональный выбор SEMO — 설명 직후, 설명과 간격 절반 수준(mt-4) */}
          {/* 모바일에서 구성 설명 폭 확보: 안쪽 여백 축소 */}
          <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/25 px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
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
              />
            )}
          </div>

          {/* Баллы — 제품 추천 블록 아래 */}
          <p className="mt-6 text-sm text-slate-600">
            {isEn
              ? `Scores: Moist. ${scores[1] >= 0 ? `+${scores[1]}` : scores[1]} · Sens. ${scores[2] >= 0 ? `+${scores[2]}` : scores[2]} · Pigm. ${scores[3] >= 0 ? `+${scores[3]}` : scores[3]} · Aging ${scores[4] >= 0 ? `+${scores[4]}` : scores[4]}`
              : `Баллы: Увл. ${scores[1] >= 0 ? `+${scores[1]}` : scores[1]} · Чувств. ${scores[2] >= 0 ? `+${scores[2]}` : scores[2]} · Пигм. ${scores[3] >= 0 ? `+${scores[3]}` : scores[3]} · Возраст. ${scores[4] >= 0 ? `+${scores[4]}` : scores[4]}`}
          </p>

          {/* Фокус ухода */}
          <div className="mt-6">
            <p className="text-sm font-medium tracking-wide text-slate-600">
              {isEn ? 'Care focus' : 'Фокус ухода'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {info.concerns.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-brand/30 bg-brand-soft/30 px-4 py-1.5 text-sm text-slate-800"
                >
                  {isEn ? englishConcernLabel(c) : c}
                </span>
              ))}
            </div>
          </div>

          {/* CTA: 모바일·데스크톱 모두 가로 2칸(한 줄) */}
          <div className="mt-10 flex flex-col items-center gap-3">
            {!userId && (
              <p className="max-w-md text-center text-sm text-slate-600">
                {isEn ? 'Save result in your profile and take the test again after registration.' : 'Сохраните результат в личном кабинете и пройдите тест ещё раз после регистрации.'}
              </p>
            )}
            {!userId && (
              <p className="max-w-md text-center text-xs text-slate-500">
                {isEn
                  ? 'Guest mode: basic test only (1 time). Detailed selfie analysis is available after sign-up.'
                  : 'Гостевой режим: только базовый тест (1 раз). Детальный селфи-анализ доступен после регистрации.'}
              </p>
            )}
            {userId && (
              <p className="max-w-md text-center text-xs text-slate-500">
                {isEn
                  ? `Detailed selfie analysis coupon: ${selfieCouponCount} available`
                  : `Купон на детальный селфи-анализ: доступно ${selfieCouponCount}`}
              </p>
            )}
            {userId && selfieCouponNotice && (
              <p className="max-w-md text-center text-xs font-medium text-emerald-700">{selfieCouponNotice}</p>
            )}
            {userId && (
              <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 text-left">
                <p className="text-sm font-semibold text-slate-800">
                  {isEn ? 'Detailed selfie analysis (coupon)' : 'Детальный селфи-анализ (по купону)'}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {isEn
                    ? 'Comparison comment appears only after selfie analysis.'
                    : 'Сравнительный комментарий показывается только после селфи-анализа.'}
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelfieFile(f);
                      setSelfieAnalyzeError(null);
                      setSelfieAnalyzeResult(null);
                      setSelfieComparisonComment(null);
                      if (selfiePreviewUrl) URL.revokeObjectURL(selfiePreviewUrl);
                      if (f) setSelfiePreviewUrl(URL.createObjectURL(f));
                      else setSelfiePreviewUrl(null);
                    }}
                    className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSelfieAnalyze()}
                    disabled={selfieAnalyzing || selfieCouponCount <= 0 || !selfieFile}
                    className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
                  >
                    {selfieAnalyzing
                      ? (isEn ? 'Analyzing...' : 'Анализ...')
                      : (isEn ? 'Use coupon & analyze' : 'Использовать купон и анализировать')}
                  </button>
                </div>
                {selfiePreviewUrl && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img src={selfiePreviewUrl} alt="selfie preview" className="h-44 w-full object-cover" />
                  </div>
                )}
                {selfieAnalyzeError && <p className="mt-2 text-xs text-red-600">{selfieAnalyzeError}</p>}
                {selfieAnalyzeResult?.skin_metrics && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                    <p className="font-semibold">{isEn ? 'Selfie KPI' : 'Селфи KPI'}</p>
                    <p className="mt-1">
                      {isEn ? 'Redness' : 'Покраснение'} {selfieAnalyzeResult.skin_metrics.redness_index ?? 0} /{' '}
                      {isEn ? 'Pigment' : 'Пигментация'} {selfieAnalyzeResult.skin_metrics.pigment_unevenness ?? 0} /{' '}
                      {isEn ? 'Texture' : 'Текстура'} {selfieAnalyzeResult.skin_metrics.texture_roughness ?? 0} /{' '}
                      {isEn ? 'Oiliness' : 'Жирность'} {selfieAnalyzeResult.skin_metrics.oiliness_index ?? 0}
                    </p>
                  </div>
                )}
                {selfieAnalyzeResult?.gemini_analysis && (
                  <p className="mt-2 text-xs text-slate-700">
                    {isEn
                      ? selfieAnalyzeResult.gemini_analysis.en?.analysis
                      : selfieAnalyzeResult.gemini_analysis.ru?.analysis}
                  </p>
                )}
                {selfieComparisonComment && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    {selfieComparisonComment}
                  </div>
                )}
              </div>
            )}
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
            {!userId && (
              <Link
                to="/login"
                className="w-full max-w-[240px] rounded-full bg-slate-800 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                {isEn ? 'Register now! Only 10 seconds!' : 'Зарегистрироваться! Всего 10 секунд!'}
              </Link>
            )}
          </div>

          {cartToast && (
            <div
              className="fixed left-1/2 z-50 max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg max-md:bottom-[calc(var(--semo-mobile-tabbar-h)+0.5rem)] md:bottom-8"
              role="status"
            >
              {isEn ? 'Added to cart' : 'Добавлен в корзину'}
            </div>
          )}
        </div>
      </main>
    );
  }

  return null;
};
