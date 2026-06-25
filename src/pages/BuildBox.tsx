import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  clearBuildBoxDraft,
  readBuildBoxDraft,
  restoreBuildBoxSelection,
  saveBuildBoxDraft,
} from '../lib/buildBoxDraft';
import {
  FALLBACK_BUILD_CATEGORIES,
  loadBuildBoxCategories,
  loadPremiumBuildProducts,
  type BuildCategory,
  type BuildProduct,
} from '../lib/buildBoxCatalog';
import {
  buildBuildProductDetailHref,
} from '../lib/buildBoxNavigation';
import { sanitizeBoxBuilderTagForDisplay } from '../lib/boxBuilderTagDisplay';
import { BoxBuilderTagBadges } from '../components/BoxBuilderTagBadges';
import { BoxReviewShowcase } from '../components/BoxReviewShowcase';
import { ShopCardImage } from './ShopCardImage';
import { userBlockedByPiAvoid } from '../lib/piProfile';

const SESSION_REVIEWING_KEY = 'semo_was_reviewing';
const DEFAULT_BOX_PRICE = 10990;
const PREMIUM_BOX_PRICE = 13990;

const PREMIUM_ADDONS: BuildProduct[] = [
  {
    id: 'premium-eye-cream',
    brand: 'TBD',
    nameRu: 'Аи крем',
    nameEn: 'Eye Cream',
    tagRu: 'Питание · Увлажнение',
    tagEn: 'Nourishing · Hydration',
    imageUrl: null,
  },
  {
    id: 'premium-cleansing-oil',
    brand: 'TBD',
    nameRu: 'Очищающее масло',
    nameEn: 'Cleansing Oil',
    tagRu: 'Двойное очищение · Все типы',
    tagEn: 'Double cleanse · All types',
    imageUrl: null,
  },
];

function BrandInitials({ brand, compact = false }: { brand: string; compact?: boolean }) {
  const initials = brand
    .split(/[\s']+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const colors: Record<string, string> = {
    "S'NATURE": 'bg-emerald-100 text-emerald-700',
    'Make p:rem': 'bg-sky-100 text-sky-700',
    COSRX: 'bg-amber-100 text-amber-700',
    'Bring Green': 'bg-green-100 text-green-700',
    Dewytree: 'bg-teal-100 text-teal-700',
    Numbuzin: 'bg-violet-100 text-violet-700',
    Ezieudu: 'bg-yellow-100 text-yellow-700',
    Biodance: 'bg-pink-100 text-pink-700',
    Intermission: 'bg-rose-100 text-rose-700',
  };
  const cls = colors[brand] ?? 'bg-slate-100 text-slate-600';
  return (
    <div className={`flex h-full w-full items-center justify-center font-semibold tracking-tight ${compact ? 'text-sm' : 'text-2xl'} ${cls}`}>
      {initials}
    </div>
  );
}

export const BuildBox: React.FC = () => {
  const { language, currency } = useI18n();
  const { addItem, removeItem, items: cartItems } = useCart();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const wantReview = searchParams.get('review') === '1';
  const wasReviewing = sessionStorage.getItem(SESSION_REVIEWING_KEY) === '1';
  const shouldRestoreDraft = wantReview || wasReviewing;
  const isEn = language === 'en';

  const [categories, setCategories] = useState<BuildCategory[]>(FALLBACK_BUILD_CATEGORIES);
  const [currentStep, setCurrentStep] = useState(() => {
    const s = parseInt(searchParams.get('slot') ?? '', 10);
    return Number.isFinite(s) && s >= 0 ? s : 0;
  });
  const [selected, setSelected] = useState<(BuildProduct | null)[]>(() =>
    shouldRestoreDraft
      ? restoreBuildBoxSelection(FALLBACK_BUILD_CATEGORIES, readBuildBoxDraft())
      : FALLBACK_BUILD_CATEGORIES.map(() => null),
  );
  const [premiumAddons, setPremiumAddons] = useState<BuildProduct[]>(PREMIUM_ADDONS);
  const [boxPrice, setBoxPrice] = useState<number>(DEFAULT_BOX_PRICE);
  const [showReview, setShowReview] = useState(false);
  const [showPremiumStep, setShowPremiumStep] = useState(false);
  const [isPremiumPlan, setIsPremiumPlan] = useState(() =>
    shouldRestoreDraft ? (readBuildBoxDraft()?.isPremium ?? false) : false,
  );
  const [categoriesLoaded, setCategoriesLoaded] = useState(false);
  const [cartToast, setCartToast] = useState(false);
  const [userBaumannType, setUserBaumannType] = useState<string | null>(null);
  const [userConcernText, setUserConcernText] = useState<string>('');
  const [userConcernTags, setUserConcernTags] = useState<string[]>([]);
  const [replaceModal, setReplaceModal] = useState<{ pendingId: string; pendingAction: () => void } | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const pauseUntilRef = useRef<number>(0);
  const carouselIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    const load = async () => {
      try {
        const priceRow = await client
          .from('site_settings')
          .select('value')
          .eq('key', 'build_box_price_rub')
          .maybeSingle();
        const val = Number((priceRow.data as { value?: string } | null)?.value ?? DEFAULT_BOX_PRICE);
        if (Number.isFinite(val) && val > 0) setBoxPrice(val);
      } catch { /* keep defaults */ }
    };
    void load();
  }, []);

  // 사용자 바우만 피부타입 로드: profiles 우선, 없으면 skin_test_results 최신 결과 사용
  useEffect(() => {
    if (!supabase || !userId) return;
    void (async () => {
      // profiles PK는 'id' 컬럼
      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('baumann_type, concern_tags')
        .eq('id', userId)
        .maybeSingle();
      console.log('[BaumannDebug] profiles query:', { profile, profErr, userId });
      type ProfileRow = { baumann_type?: string | null; concern_tags?: string[] | null };
      const profRow = profile as ProfileRow | null;
      const bt = profRow?.baumann_type;
      // concern_tags 먼저 로드 (early return 전에)
      if (profRow?.concern_tags?.length) setUserConcernTags(profRow.concern_tags);
      if (bt) { setUserBaumannType(bt); return; }

      // profiles에 없으면 skin_test_results 최신 결과 사용 + profiles에 저장
      const { data: testRows, error: testErr } = await supabase
        .from('skin_test_results')
        .select('skin_type, concern_text, concern_tags, completed_at')
        .eq('user_id', userId);
      console.log('[BaumannDebug] skin_test_results query:', { testRows, testErr });
      type TestRow = {
        skin_type?: string | null;
        concern_text?: string | null;
        concern_tags?: string[] | null;
        completed_at?: string | null;
      };
      const sorted = ((testRows ?? []) as TestRow[])
        .slice()
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime(),
        );
      const row = sorted[0] ?? null;
      const st = row?.skin_type?.trim().toUpperCase();
      console.log('[BaumannDebug] skin_type from test:', st);
      if (st && st.length === 4) {
        setUserBaumannType(st);
        void supabase.from('profiles').update({ baumann_type: st }).eq('id', userId);
      }
      if (row?.concern_tags?.length) {
        setUserConcernTags(row.concern_tags);
      } else if (row?.concern_text) {
        setUserConcernText(row.concern_text);
      }
    })();
  }, [userId]);

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 캐러셀: 스텝·모바일 여부 바뀌면 index 리셋
  useEffect(() => { setCarouselIdx(0); }, [currentStep, isMobile]);

  const CAROUSEL_VISIBLE = isMobile ? 1 : 3;
  const CAROUSEL_THRESHOLD = 4; // 4개 이하는 전부 그리드, 5개부터 캐러셀

  // 캐러셀: 자동 슬라이드 (3초 간격, 수동 조작 후 2초 멈춤)
  useEffect(() => {
    const products = categories[currentStep]?.products ?? [];
    const maxIdx = products.length > CAROUSEL_THRESHOLD
      ? Math.max(0, products.length - CAROUSEL_VISIBLE)
      : 0;
    if (maxIdx === 0) return;
    carouselIntervalRef.current = setInterval(() => {
      if (Date.now() < pauseUntilRef.current) return;
      setCarouselIdx((i) => (i >= maxIdx ? 0 : i + 1));
    }, 3000);
    return () => {
      if (carouselIntervalRef.current) clearInterval(carouselIntervalRef.current);
    };
  }, [currentStep, categories]);

  const carouselNav = (dir: 1 | -1) => {
    const products = categories[currentStep]?.products ?? [];
    const maxIdx = products.length > CAROUSEL_THRESHOLD
      ? Math.max(0, products.length - CAROUSEL_VISIBLE)
      : 0;
    if (maxIdx === 0) return;
    pauseUntilRef.current = Date.now() + 2000;
    setCarouselIdx((i) => Math.max(0, Math.min(maxIdx, i + dir)));
  };

  useEffect(() => {
    const applyLoadedCategories = (next: BuildCategory[]) => {
      setCategoriesLoaded(true);
      setCategories(next);

      if (shouldRestoreDraft) {
        const draft = readBuildBoxDraft();
        const fromDraft = restoreBuildBoxSelection(next, draft);
        setSelected((prev) => {
          if (!prev.some((p) => p !== null)) return fromDraft;
          return prev.map((p, i) => {
            if (p) {
              const cat = next[i];
              return cat?.products.find((x) => x.id === p.id) ?? p;
            }
            return fromDraft[i] ?? null;
          });
        });

        const draftComplete =
          fromDraft.every((p) => p !== null) ||
          (draft?.products?.filter(Boolean).length ?? 0) >= next.length;

        if (shouldRestoreDraft && draftComplete) {
          sessionStorage.setItem(SESSION_REVIEWING_KEY, '1');
          setShowReview(true);
          return;
        }
        const firstEmpty = fromDraft.findIndex((p) => p === null);
        setCurrentStep(firstEmpty >= 0 ? firstEmpty : Math.max(0, next.length - 1));
        return;
      }

      setSelected(new Array(next.length).fill(null));
      setCurrentStep(0);
      setShowReview(false);
      setShowPremiumStep(false);
    };

    if (!supabase) {
      applyLoadedCategories(FALLBACK_BUILD_CATEGORIES);
      return;
    }
    void loadBuildBoxCategories(supabase).then(applyLoadedCategories);
    void loadPremiumBuildProducts(supabase).then((items) => {
      if (items.length > 0) setPremiumAddons(items);
    });
  }, [wantReview, shouldRestoreDraft]);

  useEffect(() => {
    saveBuildBoxDraft(selected, isPremiumPlan);
  }, [selected, isPremiumPlan]);

  const totalSteps = categories.length;
  const category = categories[currentStep]!;
  const currentSelection = selected[currentStep];
  const allSelected = selected.every((p) => p !== null);

  const selectProduct = (product: BuildProduct) => {
    setSelected((prev) => {
      const next = [...prev];
      next[currentStep] = product;
      saveBuildBoxDraft(next);
      return next;
    });
  };

  const goNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      sessionStorage.setItem(SESSION_REVIEWING_KEY, '1');
      setShowReview(true);
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleStartOver = () => {
    clearBuildBoxDraft();
    sessionStorage.removeItem(SESSION_REVIEWING_KEY);
    setSelected(categories.map(() => null));
    setCurrentStep(0);
    setShowReview(false);
    setShowPremiumStep(false);
    setIsPremiumPlan(false);
    setCarouselIdx(0);
  };

  const existingBoxId = cartItems.find((i) => i.id.startsWith('custom-build-box'))?.id;

  const doAddToCart = (id: string, name: string, price: number, isPremium: boolean) => {
    saveBuildBoxDraft(selected, isPremium);
    addItem({ id, name, price, imageUrl: null, currency });
    setCartToast(true);
    setTimeout(() => { setCartToast(false); navigate('/cart'); }, 1200);
  };

  const handleAddToCart = () => {
    setIsPremiumPlan(false);
    const id = 'custom-build-box';
    const name = isEn ? 'Custom Box' : 'Свой бокс';
    if (existingBoxId && existingBoxId !== id) {
      setReplaceModal({ pendingId: existingBoxId, pendingAction: () => { removeItem(existingBoxId); doAddToCart(id, name, boxPrice, false); } });
      return;
    }
    doAddToCart(id, name, boxPrice, false);
  };

  const handleAddPremiumToCart = () => {
    setIsPremiumPlan(true);
    const id = 'custom-build-box-premium';
    const name = isEn ? 'Custom Box Premium' : 'Свой бокс Премиум';
    if (existingBoxId && existingBoxId !== id) {
      setReplaceModal({ pendingId: existingBoxId, pendingAction: () => { removeItem(existingBoxId); doAddToCart(id, name, PREMIUM_BOX_PRICE, true); } });
      return;
    }
    doAddToCart(id, name, PREMIUM_BOX_PRICE, true);
  };

  const isLastStep = currentStep === totalSteps - 1;
  const canGoNext = currentSelection !== null;

  // 바우만 타입 매칭 점수
  // 일치: D/O +3, S/R +2, N/P +1, T/W +1 (최대 7)
  // 불일치 패널티: D/O -2, S/R -3 (민감도 축은 자극 위험 → 패널티 강화)
  // 완전일치 보너스: +3
  // 코드 수가 적을수록 특화 제품 → 보너스 +1
  const baumannScore = (userType: string, productTypes: string[]): number => {
    if (!productTypes?.length || !userType) return 0;
    const u = userType.toUpperCase();
    const scores = productTypes.map(t => {
      const p = t.toUpperCase();
      if (p.length !== 4) return -99;
      let score = 0;
      score += p[0] === u[0] ? 3 : -2; // D/O
      score += p[1] === u[1] ? 2 : -3; // S/R (민감도 불일치 패널티 강화)
      score += p[2] === u[2] ? 1 : 0;  // N/P (패널티 없음)
      score += p[3] === u[3] ? 1 : 0;  // T/W (패널티 없음)
      if (p === u) score += 3;          // 완전일치 보너스
      return score;
    });
    const best = Math.max(...scores);
    // 코드 수 적을수록 특화 → 보너스
    const specialization = productTypes.length <= 2 ? 1 : 0;
    return best + specialization;
  };

  // 고민 텍스트 → concern 태그 배열
  const parseConcernTags = (text: string): string[] => {
    if (!text) return [];
    const t = text.toLowerCase();
    const tags: string[] = [];
    if (/dry|tight|moistur|сух|стянут|увлажн|건조|당김/.test(t)) tags.push('dry');
    if (/oil|sebum|жир|блеск|pore|поры|기름|유분|번들/.test(t)) tags.push('oily');
    if (/sensitiv|чувствит|redness|красн|irritat|раздраж|민감|예민|홍조/.test(t)) tags.push('sensitive');
    if (/pigment|spot|тон|пятн|기미|잡티|색소/.test(t)) tags.push('pigmented');
    if (/bright|glow|сияние|сияни|radianc|тускл|glow/.test(t)) tags.push('glow');
    if (/aging|wrinkle|firm|морщин|упруг|anti.?age|주름|탄력|노화/.test(t)) tags.push('aging');
    return tags;
  };

  // 슬롯 aware 고민 점수
  // 클렌저·크림: D/O 축과 충돌하는 고민은 무시 (바우만 우선)
  // 세럼·토너·앰플: aging·pigmented·sensitive 고민은 항상 반영
  const CONCERN_BADGE_MAP: Record<string, string[]> = {
    dry:            ['moisture','hydration','nourishing','rich','repair','soothing','gentle','dry skin','balanced moisture'],
    oily:           ['oil control','oil-free','anti-blemish','blemish','pore','exfoliat'],
    sensitive:      ['gentle','soothing','low irritation','sensitive skin','balanced moisture','gentle cleanse'],
    pigmented:      ['brightening','tone-up','renewal','glow','gentle glow'],
    aging:          ['anti-aging','firming','collagen','cell energy','skin vitality'],
    glow:           ['brightening','glow','radiance','illuminat','tone-up','renewal','gentle glow'],
    dehydrated_oily:['oil control','balanced moisture','hydration','moisture-balance','pore','oil-free'],
  };
  const slotConcernScore = (slot: string, badges: string[], baumannType: string, tags: string[]): number => {
    if (!tags.length || !badges.length) return 0;
    const isDry = baumannType[0] === 'D';
    const filtered = tags.filter(tag => {
      // 클렌저·크림 슬롯: D/O 반대 고민 무시
      if (['cleanser', 'cream'].includes(slot)) {
        if (isDry && tag === 'oily') return false;
        if (!isDry && tag === 'dry') return false;
      }
      return true;
    });
    const badgesLower = badges.map(b => b.toLowerCase());
    let score = 0;
    for (const tag of filtered) {
      for (const kw of CONCERN_BADGE_MAP[tag] ?? []) {
        if (badgesLower.some(b => b.includes(kw))) { score += 1.5; break; }
      }
    }
    return Math.min(score, 4);
  };

  // 현재 카테고리에서 최고점 1개만 왕관
  const recommendedProductIds = (() => {
    if (!userBaumannType) return new Set<string>();
    const eligible = category.products.filter(
      (p) => !userBlockedByPiAvoid(userBaumannType, p.piProfile),
    );
    const concernTags = userConcernTags.length ? userConcernTags : parseConcernTags(userConcernText);
    const scored = eligible.map(p => ({
      id: p.id,
      score: baumannScore(userBaumannType, p.baumannTypes ?? [])
           + slotConcernScore(category.key, p.piProfile?.badges?.en ?? [], userBaumannType, concernTags),
    }));
    const maxScore = Math.max(-99, ...scored.map(s => s.score));
    if (scored.length === 0) return new Set<string>();
    const top = scored
      .filter(s => s.score === maxScore)
      .sort((a, b) => {
        const pa = category.products.find(p => p.id === a.id)?.baumannTypes?.length ?? 99;
        const pb = category.products.find(p => p.id === b.id)?.baumannTypes?.length ?? 99;
        return pa - pb;
      });
    return new Set([top[0].id]); // 왕관 1개만
  })();

  const buildRecommendationReason = (product: BuildProduct): string => {
    const u = userBaumannType?.toUpperCase() ?? '';
    if (!u || u.length !== 4) return '';
    const types = product.baumannTypes ?? [];
    const badges = product.piProfile?.badges?.en ?? [];
    const badgesRu = product.piProfile?.badges?.ru ?? [];
    const badgesLower = badges.map(b => b.toLowerCase());
    const concernTags = userConcernTags.length ? userConcernTags : parseConcernTags(userConcernText);
    const keyEn = badges[0] ?? '';
    const keyRu = badgesRu[0] ?? keyEn;
    const feat = isEn ? keyEn : keyRu;
    const pre = feat ? `${feat}. ` : '';

    if (concernTags.includes('aging') && badgesLower.some(b => ['anti-aging','firming','collagen','cell energy','skin vitality'].some(kw => b.includes(kw)))) {
      return isEn
        ? `${pre}Actively targets wrinkles — just what your skin needs.`
        : `${pre}Активно борется с морщинами — именно то, что нужно твоей коже.`;
    }
    if (concernTags.includes('dry') && badgesLower.some(b => ['moisture','hydration','nourishing','rich'].some(kw => b.includes(kw)))) {
      return isEn
        ? `${pre}Deeply moisturizes and nourishes your dry skin.`
        : `${pre}Глубоко питает и увлажняет твою сухую кожу.`;
    }
    if (concernTags.includes('sensitive') && badgesLower.some(b => ['gentle','soothing','low irritation'].some(kw => b.includes(kw)))) {
      return isEn
        ? `${pre}Gentle, non-irritating. Made for your sensitive skin.`
        : `${pre}Мягко, без раздражения. Подобрано для твоей чувствительной кожи.`;
    }
    if ((concernTags.includes('glow') || concernTags.includes('pigmented')) && badgesLower.some(b => ['brightening','glow','tone-up','renewal','gentle glow'].some(kw => b.includes(kw)))) {
      return isEn
        ? `${pre}Evens skin tone and brings back your glow.`
        : `${pre}Выравнивает тон и возвращает сияние твоей коже.`;
    }

    if (!types.length) return isEn ? 'The best pick for your skin type.' : 'Лучший выбор для твоего типа кожи.';

    const isDry = u[0] === 'D';
    const isSens = u[1] === 'S';
    const isWrinkle = u[3] === 'W';

    if (isDry && isSens && isWrinkle) {
      return isEn
        ? `${pre}Gentle care for dry, sensitive skin — with anti-aging action.`
        : `${pre}Бережный уход для сухой чувствительной кожи с антивозрастным эффектом.`;
    }
    if (isDry && isSens) {
      return isEn
        ? `${pre}Made for your dry, sensitive skin.`
        : `${pre}Создано для твоей сухой чувствительной кожи.`;
    }
    if (!isDry && isSens) {
      return isEn
        ? `${pre}Balances oiliness without irritating sensitive skin.`
        : `${pre}Балансирует жирность, не раздражает чувствительную кожу.`;
    }
    if (isDry && !isSens) {
      return isEn
        ? `${pre}Nourishes and restores your dry skin.`
        : `${pre}Питает и восстанавливает твою сухую кожу.`;
    }
    if (!isDry && !isSens) {
      return isEn
        ? `${pre}Controls shine for your combination skin.`
        : `${pre}Контролирует жирность твоей смешанной кожи.`;
    }
    if (isWrinkle) {
      return isEn
        ? `${pre}Actively works against wrinkles.`
        : `${pre}Активно работает против морщин.`;
    }

    return isEn ? 'The best match for your skin test.' : 'Лучший выбор по результату твоего теста.';
  };

  const renderProductCard = (product: BuildProduct) => {
    const isSelected = currentSelection?.id === product.id;
    const productName = isEn ? product.nameEn : product.nameRu;
    const isRecommended = recommendedProductIds.has(product.id);
    const tagRaw = isEn ? product.tagEn : product.tagRu;
    const tagDisplay = sanitizeBoxBuilderTagForDisplay(tagRaw);
    const reasonText = isRecommended && userBaumannType ? buildRecommendationReason(product) : '';
    const mBadge = product.marketingBadge;

    return (
      <button
        type="button"
        onClick={() => selectProduct(product)}
        className={`group flex w-full min-w-0 flex-col overflow-hidden rounded-xl border-2 bg-white text-center transition
          ${isSelected
            ? 'border-orange-500'
            : isRecommended
              ? 'border-amber-400'
              : 'border-slate-200 hover:border-slate-300'
          }`}
      >
        {isRecommended && (
          <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-3.5 py-3 text-center">
            <p className="flex items-center justify-center gap-1 text-[10px] font-semibold text-amber-700">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm0 -12a2 2 0 0 1 2 2a2 2 0 0 1 2 -2a2 2 0 0 1 -2 -2a2 2 0 0 1 -2 2zm-7 12a6 6 0 0 1 6 -6a6 6 0 0 1 -6 -6a6 6 0 0 1 -6 6a6 6 0 0 1 6 6z" /></svg>
              {isEn ? 'For you' : 'Для тебя'}
            </p>
            {reasonText && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-amber-800">{reasonText}</p>
            )}
          </div>
        )}
        <div className="relative shrink-0">
          <ShopCardImage
            embedded
            images={product.imageUrl ? [product.imageUrl] : []}
            name={productName}
          />
          {mBadge && (
            <span className={`absolute left-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur-sm ${
              mBadge === 'retail_top' ? 'text-green-600' : 'text-slate-700'
            }`}>
              {mBadge === 'retail_top'
                ? (isEn ? 'K-retail #1' : 'К-ретейл №1')
                : (isEn ? '1M YouTuber pick' : 'Выбор 1М ютубера')
              }
            </span>
          )}
        </div>
        <div className="flex min-w-0 flex-col p-3 text-center">
          <p className="mb-0.5 w-full truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {product.brand}
          </p>
          <p className="mb-2 line-clamp-2 min-h-[2.5rem] w-full text-center text-sm font-medium leading-snug text-slate-800">
            {productName}
          </p>
          <BoxBuilderTagBadges
            tag={tagRaw}
            selected={isSelected}
            title={isEn
              ? (product.baumannReasonEn || product.tagEn || '')
              : (product.baumannReasonRu || tagDisplay || '')}
          />
          <div className="-mx-3 mb-2 mt-2 h-px bg-slate-100" />
          <div className="flex items-center justify-center gap-2">
            <span
              className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition
                ${isSelected
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                }`}
            >
              {isSelected
                ? isEn ? 'Selected ✓' : 'Выбрано ✓'
                : isEn ? 'Select' : 'Выбрать'}
            </span>
            {!isSelected && (product.skuId || product.productId) && (
              <Link
                to={buildBuildProductDetailHref(product, `/shop/build?slot=${currentStep}`) ?? '#'}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-brand/40 hover:text-brand"
              >
                {isEn ? 'Details' : 'Подробнее'}
              </Link>
            )}
          </div>
        </div>
      </button>
    );
  };

  // ── 선형 진행 힌트 (스텝 인디케이터 위) ───────────────────────
  const renderLinearProgress = (premiumActive = false) => {
    const doneCount = premiumActive
      ? categories.length
      : selected.filter(Boolean).length;
    const total = totalSteps;
    const pct = Math.round((doneCount / total) * 100);
    const remaining = total - doneCount;
    const hintText = premiumActive
      ? (isEn ? 'Almost there! Choose Premium or Basic.' : 'Почти готово! Выбери Премиум или Базовый.')
      : doneCount === 0
        ? (isEn ? `Choose ${total} products to complete your box.` : `Выбери ${total} продуктов для своего бокса.`)
        : remaining === 0
          ? (isEn ? 'All done — review your box!' : 'Всё выбрано — посмотри свой бокс!')
          : (isEn ? `${remaining} more to go!` : `Ещё ${remaining} — и готово!`);
    return (
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between px-0.5">
          <span className="text-[10px] font-medium text-slate-400">{hintText}</span>
          <span className="text-[10px] font-semibold text-slate-500">{pct}%</span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: premiumActive
                ? 'linear-gradient(90deg, #10b981, #f59e0b)'
                : 'linear-gradient(90deg, #10b981, #6366f1)',
            }}
          />
        </div>
      </div>
    );
  };

  // ── 공통: 프로그레스 바 (선택 + 프리미엄 스텝에서 공유) ───────────
  const renderProgressBar = (premiumActive = false) => (
    <div className="mb-5 flex w-full items-start overflow-x-auto px-1 pb-1 [&::-webkit-scrollbar]:hidden sm:justify-center" style={{ scrollbarWidth: 'none' }}>
      {categories.map((cat, i) => {
        const isDone = selected[i] !== null && (premiumActive || i < currentStep);
        const isActive = !premiumActive && i === currentStep;
        const isPending = !premiumActive && i > currentStep && selected[i] === null;
        const sel = selected[i];
        return (
          <React.Fragment key={cat.key}>
            <div className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 px-0.5 sm:w-auto sm:min-w-0 sm:flex-1 sm:max-w-[5.25rem]">
              <button
                type="button"
                onClick={() => {
                  if (premiumActive) { setShowPremiumStep(false); setCurrentStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                  else if (!isPending) { setCurrentStep(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }
                }}
                disabled={isPending}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition
                  ${isDone ? 'bg-emerald-500 text-white' : ''}
                  ${isActive ? 'bg-brand text-white ring-2 ring-brand/30' : ''}
                  ${isPending ? 'border border-slate-200 bg-white text-slate-400' : ''}
                `}
              >
                {isDone ? (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : i + 1}
              </button>
              <span className={`w-full text-center text-[8px] leading-tight font-medium
                ${isActive ? 'text-brand' : isDone ? 'text-emerald-600' : 'text-slate-400'}`}>
                {isEn ? cat.labelEn : cat.labelRu}
              </span>
              {sel ? (
                <span className="w-full text-center text-[9px] leading-snug text-slate-900 break-words [overflow-wrap:anywhere]">
                  {sel.brand}
                </span>
              ) : (
                <span className="min-h-[11px]" aria-hidden />
              )}
            </div>
            {i < categories.length - 1 && (
              <div className={`mt-4 h-px w-4 shrink-0 sm:w-2.5 ${isDone ? 'bg-emerald-400' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        );
      })}
      <div className={`mt-4 h-px w-4 shrink-0 sm:w-2.5 ${premiumActive ? 'bg-amber-400' : 'bg-slate-200'}`} />
      <div className="flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 sm:max-w-[5.25rem]">
        <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold transition
          ${premiumActive ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'border border-slate-200 bg-white text-slate-400'}`}>
          ✦
        </div>
        <span className={`w-full text-center text-[8px] leading-tight font-medium
          ${premiumActive ? 'text-amber-600' : 'text-slate-400'}`}>
          {isEn ? 'Premium' : 'Премиум'}
        </span>
      </div>
    </div>
  );

  // ── 프리미엄 스텝 ───────────────────────────────────────────
  if (showPremiumStep) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => { setShowPremiumStep(false); setShowReview(true); }}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {isEn ? 'Back' : 'Назад'}
          </button>
        </div>

        <h1 className="mb-1 text-center text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {isEn ? 'Premium Box' : 'Премиум бокс'}
        </h1>
        <p className="mb-4 text-center text-xs text-slate-500">
          {isEn
            ? 'These 2 products are included with your Premium Box.'
            : 'Эти 2 продукта входят в состав Премиум бокса.'}
        </p>

        {renderLinearProgress(true)}
        {renderProgressBar(true)}

        <div className="mx-auto max-w-xl">
          <p className="mb-0.5 text-xs font-medium uppercase tracking-widest text-amber-500">
              {isEn ? 'Premium Add-ons · Pre-selected' : 'Премиум дополнения · Уже включены'}
            </p>
            <h2 className="mb-3 text-base font-semibold text-slate-900">
              {isEn ? 'Included in your Premium Box' : 'Входит в Премиум бокс'}
            </h2>

            <div className="grid grid-cols-2 items-stretch gap-3">
              {premiumAddons.map((product) => (
                <div
                  key={product.id}
                  className="flex h-full w-full flex-col overflow-hidden rounded-xl border-2 border-amber-300 bg-white"
                >
                  <div className="relative shrink-0">
                    <ShopCardImage
                      embedded
                      images={product.imageUrl ? [product.imageUrl] : []}
                      name={isEn ? product.nameEn : product.nameRu}
                    />
                    <span className="absolute left-2 top-2 rounded-md bg-white/85 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500 backdrop-blur-sm">
                      {isEn ? 'Premium' : 'Премиум'}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-3 text-center">
                    <p className="mb-0.5 truncate text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      {product.brand === 'TBD' ? (isEn ? 'To be announced' : 'Скоро') : product.brand}
                    </p>
                    <p className="mb-2 line-clamp-2 min-h-[2.75rem] text-sm font-medium leading-snug text-slate-800">
                      {isEn ? product.nameEn : product.nameRu}
                    </p>
                    <BoxBuilderTagBadges tag={isEn ? product.tagEn : product.tagRu} selected />
                    <div className="-mx-3 mb-2 h-px bg-slate-100" />
                    <div className="mt-auto flex flex-col items-stretch gap-1.5 sm:flex-row sm:items-center sm:justify-center sm:gap-2">
                      <span className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-medium text-white sm:px-3 sm:text-xs">
                        {isEn ? 'Included' : 'Включено'}
                        <span aria-hidden="true">✓</span>
                      </span>
                      {(product.skuId || product.productId) && (
                        <Link
                          to={buildBuildProductDetailHref(product) ?? '#'}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500 transition hover:border-brand/40 hover:text-brand sm:px-3 sm:text-xs"
                        >
                          {isEn ? 'Details' : 'Подробнее'}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <button
                type="button"
                onClick={handleAddToCart}
                className="inline-flex w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 sm:w-auto sm:px-4 sm:text-sm"
              >
                {isEn ? `Basic only · ${boxPrice.toLocaleString()} ₽` : `Только базовый · ${boxPrice.toLocaleString()} ₽`}
              </button>
              <button
                type="button"
                onClick={handleAddPremiumToCart}
                className="inline-flex w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-600 sm:w-auto sm:gap-2 sm:px-6 sm:py-2.5 sm:text-sm"
              >
                <span className="shrink-0" aria-hidden="true">✦</span>
                {isEn ? `Add Premium · ${PREMIUM_BOX_PRICE.toLocaleString()} ₽` : `Добавить Премиум · ${PREMIUM_BOX_PRICE.toLocaleString()} ₽`}
              </button>
            </div>
          </div>

        {cartToast && (
          <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6" role="status" aria-live="polite">
            {isEn ? 'Box added to cart!' : 'Бокс добавлен в корзину!'}
          </div>
        )}
      </main>
    );
  }

  // ── 리뷰 화면 ──────────────────────────────────────────────
  if (showReview) {
    return (
      <main className="mx-auto max-w-4xl px-4 pb-12 pt-5 sm:px-6">
        {/* 헤더 */}
        <div className="mb-6 flex items-center">
          <button
            type="button"
            onClick={() => setShowReview(false)}
            className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {isEn ? 'Edit' : 'Изменить'}
          </button>
          <h1 className="flex-1 text-center text-xl font-semibold tracking-tight text-slate-900">
            {isEn ? 'Your box is ready' : 'Твой бокс готов'}
          </h1>
          <div className="w-16 shrink-0" />
        </div>

        {/* 2컬럼: 가격카드(왼쪽) + 쇼케이스(오른쪽) */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">

          {/* 가격 카드 + 프리미엄 — 분리된 레이아웃 */}
          <div className="order-2 flex flex-col gap-3 sm:order-1 sm:w-64 sm:shrink-0">

            {/* 기본박스 카드 */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="px-5 py-5">
                <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  {isEn ? 'Basic Box · 6 items' : 'Базовый бокс · 6 продуктов'}
                </p>
                <p className="mt-2 text-[1.75rem] font-bold leading-none tracking-tight text-slate-900">
                  {boxPrice.toLocaleString()} ₽
                </p>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-xs font-semibold text-white transition hover:bg-brand/90"
                >
                  <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  {isEn ? 'Add to cart' : 'Добавить в корзину'}
                </button>
              </div>
            </div>

            {/* 프리미엄 — 점선 카드 (서브 옵션 느낌) */}
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50/60 px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold text-amber-700">
                  ✦ {isEn ? 'Want more?' : 'Хочешь больше?'}
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {PREMIUM_BOX_PRICE.toLocaleString()} ₽
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                {premiumAddons.map((addon) => (
                  <span key={addon.id} className="flex min-w-0 items-center gap-1 text-[11px] text-slate-500">
                    <span className="shrink-0 text-amber-500">+</span>
                    <span className="truncate">{isEn ? addon.nameEn : addon.nameRu}</span>
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { setIsPremiumPlan(true); setShowReview(false); setShowPremiumStep(true); }}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-amber-400 bg-transparent py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
              >
                {isEn ? 'Upgrade to Premium' : 'Апгрейд до Премиум'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleStartOver}
              className="flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white py-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
            >
              {isEn ? 'Start over' : 'Собрать с начала'}
            </button>

          </div>

          <div className="order-1 min-w-0 sm:order-2 sm:flex-1">
            <BoxReviewShowcase
              selected={selected}
              categories={categories}
              isEn={isEn}
              isPremium={isPremiumPlan}
              premiumAddons={premiumAddons}
            />
          </div>
        </div>

        {cartToast && (
          <div
            className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-slate-800 px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-6"
            role="status"
            aria-live="polite"
          >
            {isEn ? 'Box added to cart!' : 'Бокс добавлен в корзину!'}
          </div>
        )}

        {replaceModal && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
              <p className="text-sm font-semibold text-slate-900">
                {isEn ? 'Replace existing box?' : 'Заменить бокс в корзине?'}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                {isEn
                  ? 'A different box is already in your cart. Replace it with the new configuration?'
                  : 'В корзине уже есть другой бокс. Заменить на новую конфигурацию?'}
              </p>
              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => { replaceModal.pendingAction(); setReplaceModal(null); }}
                  className="flex-1 rounded-full bg-brand py-2 text-xs font-semibold text-white transition hover:bg-brand/90"
                >
                  {isEn ? 'Replace' : 'Заменить'}
                </button>
                <button
                  type="button"
                  onClick={() => setReplaceModal(null)}
                  className="flex-1 rounded-full border border-slate-200 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  {isEn ? 'Cancel' : 'Отмена'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ── 선택 화면 ──────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl px-4 pb-6 pt-4 sm:px-6 lg:px-8">
      <div className="mb-3">
        <Link
          to="/shop"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {isEn ? 'Back to shop' : 'Назад'}
        </Link>
      </div>

      <h1 className="mb-1 text-center text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        {isEn ? 'Build your box' : 'Собери свой бокс'}
      </h1>
      <p className="mb-3 text-center text-xs text-slate-500">
        {isEn
          ? 'Pick skincare for your skin type and complete your box.'
          : 'Подбери уход под свой тип кожи и собери персональный бокс.'}
      </p>

      {renderLinearProgress()}
      {renderProgressBar()}

      {/* 메인 레이아웃 — 상품 카드 (부모 max-w-5xl 전체 너비 사용) */}
      <div className="w-full">
        {!categoriesLoaded ? (
          <div className="space-y-3">
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
            <div className="h-6 w-40 animate-pulse rounded bg-slate-200" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="h-36 w-full animate-pulse bg-slate-100" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                    <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-20 animate-pulse rounded bg-slate-200" />
                    <div className="mt-3 h-6 w-16 animate-pulse rounded-full bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
          {/* 제품 목록 — 4개 이하는 그리드, 5개 이상은 캐러셀 */}
          {(() => {
            const N = category.products.length;
            const maxIdx = Math.max(0, N - CAROUSEL_VISIBLE);
            const needsScroll = N > CAROUSEL_THRESHOLD;

            if (!needsScroll) {
              const gridClass =
                N === 1
                  ? 'mx-auto grid max-w-xs grid-cols-1 items-end gap-3'
                  : N === 2
                    ? 'mx-auto grid max-w-lg grid-cols-1 items-end gap-3 sm:grid-cols-2'
                    : N === 4
                      ? 'grid grid-cols-1 items-end gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4'
                      : 'grid grid-cols-1 items-end gap-3 sm:grid-cols-3 sm:gap-4';
              return (
                <div className={gridClass}>
                  {category.products.map((product) => (
                    <div key={product.id} className="min-w-0">
                      {renderProductCard(product)}
                    </div>
                  ))}
                </div>
              );
            }

            const cardWidth = `calc((100% - ${(CAROUSEL_VISIBLE - 1) * 0.75}rem) / ${CAROUSEL_VISIBLE})`;
            return (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => carouselNav(-1)}
                  disabled={carouselIdx === 0}
                  className="absolute -left-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-30"
                  aria-label="이전"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => carouselNav(1)}
                  disabled={carouselIdx >= maxIdx}
                  className="absolute -right-2 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 disabled:opacity-30"
                  aria-label="다음"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <div className="overflow-hidden px-1 pb-1 pt-1">
                  <div
                    className="flex items-end gap-3 transition-transform duration-500 ease-in-out"
                    style={{
                      transform: `translateX(calc(-${carouselIdx} * (${cardWidth} + 0.75rem)))`,
                    }}
                  >
                    {category.products.map((product) => (
                      <div key={product.id} className="min-w-0 shrink-0" style={{ width: cardWidth }}>
                        {renderProductCard(product)}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 flex justify-center gap-1.5">
                  {Array.from({ length: maxIdx + 1 }, (_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { pauseUntilRef.current = Date.now() + 2000; setCarouselIdx(i); }}
                      className={`h-1.5 rounded-full transition-all ${i === carouselIdx ? 'w-4 bg-brand' : 'w-1.5 bg-slate-200'}`}
                    />
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={currentStep === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-30"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {isEn ? 'Back' : 'Назад'}
            </button>

            <button
              type="button"
              onClick={goNext}
              disabled={!canGoNext}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 disabled:opacity-40"
            >
              {isLastStep
                ? isEn ? 'Review box' : 'Посмотреть бокс'
                : isEn ? 'Next' : 'Далее'}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          </>
        )}
      </div>

      {/* 모바일: 하단 요약 바 */}
      {selected.some((p) => p !== null) && (
        <div className="fixed bottom-[var(--semo-mobile-tabbar-h,64px)] left-0 right-0 z-10 border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-700">
                {selected.filter(Boolean).length}/{totalSteps}{' '}
                {isEn ? 'selected' : 'выбрано'}
              </p>
            </div>
            {allSelected && (
              <button
                type="button"
                onClick={() => setShowReview(true)}
                className="shrink-0 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
              >
                {isEn ? 'Review box' : 'Посмотреть бокс'}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
};
