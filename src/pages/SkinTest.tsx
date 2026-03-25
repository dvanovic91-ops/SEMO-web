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
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { BackArrow } from '../components/BackArrow';
import { ProductCompositionGrid, type ProductCompositionItem } from '../components/ProductCompositionGrid';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';
import { getOrCreateVisitSessionId } from '../lib/clientSession';
import { getRecommendedProductIdForSkinType } from '../lib/skinTypeSlotMapping';

const MAX_TEST_COUNT = 2;

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

type Stage = 'intro' | 'profile' | 'test' | 'result';

/** 프로필 다음 단계 */
function nextProfileStep(step: number): number {
  return step + 1;
}

export const SkinTest: React.FC = () => {
  const { userId, userEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const { addItem } = useCart();
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);
  const noTestLimit = !!userEmail && UNLIMITED_TEST_EMAILS.includes(userEmail);
  const [stage, setStage] = useState<Stage>('intro');
  const [testCount, setTestCount] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, string>>({});
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
            .select('id, sort_order, name, image_url, image_urls, description, sku_items(display_name, description, image_url)')
            .eq('product_id', productId);
          if (Array.isArray(compRows)) {
            composition = (compRows as any[])
              .slice()
              .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              .map((c: any) => {
                const sku = c.sku_items as { display_name?: string | null; description?: string | null; image_url?: string | null } | null;
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
      setStage('test');
      setQuestionIndex(0);
      setAnswers([]);
    } else {
      setProfileStep(nextProfileStep(profileStep));
    }
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
      desc: 'Результат теста сохранён.',
      concerns: [] as string[],
      avoid: '',
    };
    setResult({ type, info, scores });
    if (userId) {
      if (supabase) {
        supabase.from('skin_test_results').insert({ user_id: userId, skin_type: type }).then(() => {
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
                Тест типа кожи
              </h1>
              <p className="mt-4 text-lg text-slate-600">Без аккаунта тест можно пройти один раз</p>
            </header>
            <div className="px-1 text-center">
            <p className="text-center text-sm leading-snug text-slate-600 sm:text-base md:text-lg">
              Тест можно пройти один раз без регистрации. Зарегистрируйтесь — результат сохранится и вы сможете пройти тест ещё раз.
            </p>
            <p className="mt-4 text-center text-base font-semibold text-brand sm:text-lg">
              Зарегистрируйтесь! Всего 10 секунд!
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/login"
                className="w-full max-w-xs rounded-full bg-brand py-3.5 text-center text-sm font-medium text-white transition hover:bg-brand/90 sm:py-4"
              >
                Зарегистрироваться! Всего 10 секунд!
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
                Тест типа кожи
              </h1>
              <p className="mt-4 text-lg text-slate-600">Лимит прохождений для вашего аккаунта</p>
            </header>
            <div className="px-1 text-center">
            <p className="text-center text-sm leading-snug text-slate-600 sm:text-base md:text-lg">
              Тест можно пройти не более 2 раз. Ваши результаты — в разделе «Профиль».
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/profile"
                className="w-full max-w-xs rounded-full bg-brand py-3.5 text-center text-sm font-medium text-white transition hover:bg-brand/90 sm:py-4"
              >
                В профиль
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
            Тест типа кожи
          </h1>
          <p className="text-sm italic leading-snug text-slate-600 break-words sm:text-base sm:leading-relaxed md:text-lg">
            «Даже дорогой уход бесполезен, если он не подходит вашей коже. Пройдите тест, чтобы не тратить лишнего и получить экспертный план ухода!»
          </p>
          <p className="text-xs leading-snug text-slate-400 break-words sm:text-sm sm:leading-relaxed">
            Это ваш экспертный гид для ежедневного ухода. Для диагностики специфических заболеваний рекомендуем
            дополнить тест консультацией врача.
          </p>
          <div className="flex w-full flex-col items-center">
            <button
              type="button"
              onClick={handleAgree}
              className="w-full max-w-xs rounded-full border border-brand bg-white py-3 text-sm font-medium text-brand transition hover:bg-brand hover:text-white sm:py-3.5 md:py-4"
            >
              Согласен(а) и начать
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ─── 프로필: 본 테스트와 동일 레이아웃(가운데·같은 위치·같은 간격) ───
  if (stage === 'profile') {
    const step = PROFILE_STEPS[profileStep];
    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-20 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            Несколько вопросов перед тестом
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
                Предыдущий шаг
              </button>
            )}
          </div>
          <p className="mt-4 tabular-nums text-sm text-slate-500 sm:mt-5">
            {profileStep + 1}/{PROFILE_STEPS.length}
          </p>
        </div>
      </main>
    );
  }

  // ─── 테스트: 볼드 소제목, 괄호 숫자 제거·1/20은 답 밑, 간격 확대 ───
  if (stage === 'test') {
    const q = QUESTIONS[questionIndex];
    const current = questionIndex + 1;
    const total = QUESTIONS.length;

    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-24 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          {/* 소제목: 주황·볼드, 괄호 숫자 없음 */}
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            Тест типа кожи SEMO
          </p>

          {/* 질문 — 소제목과 간격 넓힘 */}
          <p className="text-sm font-light leading-snug tracking-wide text-slate-800 sm:text-base sm:leading-relaxed">
            {q.text}
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
              return ANSWERS.map(([label, valueKey]) => (
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
                Завершить тест
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
              Предыдущий вопрос
            </button>
            {/* 테스트 전 단계로: 1번에서만 표시, 2~20번에서는 숨김 */}
            {questionIndex === 0 && (
              <button
                type="button"
                onClick={handleBackToProfile}
                className="mt-1 flex items-center justify-center gap-1.5 text-sm font-medium text-brand hover:opacity-90 sm:mt-2"
              >
                <BackArrow />
                Несколько вопросов перед тестом
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
              Результат теста
            </p>
            <h1 className="mt-4 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              Ваш тип кожи: {type}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{info.name}</p>
          </div>

          {/* 설명 — 타입 부제목과 간격 절반(mt-10→mt-5), 블록 패딩 절반(py-6→py-3) */}
          <div className="mt-5 py-3">
            <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
              {info.desc.replace(/\s*[\u2728\u{1F31F}\u{1F338}\u{1F4AB}\u{1F3C6}\u{1F33F}]+\s*$/gu, '').trim()}
            </p>
          </div>

          {/* Персональный выбор SEMO — 설명 직후, 설명과 간격 절반 수준(mt-4) */}
          {/* 모바일에서 구성 설명 폭 확보: 안쪽 여백 축소 */}
          <div className="mt-4 rounded-xl border border-brand/20 bg-brand-soft/25 px-3 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6">
            <p className="text-sm font-medium tracking-wide text-brand">
              {recommendedProductPreview?.status === 'ok' && recommendedProductPreview.name?.trim()
                ? `Персональный выбор SEMO : ${recommendedProductPreview.name.trim()}`
                : 'Персональный выбор SEMO'}
            </p>
            {recommendedProductPreview?.status === 'no_slot' && (
              <p className="mt-2 text-xs leading-snug text-slate-600 sm:text-sm">
                Рекомендуемый товар не найден. В админке проверьте слоты каталога{' '}
                <span className="whitespace-nowrap">Beauty box</span>: должно быть не меньше строк, чем номер слота для
                вашего типа кожи (например, для 4-го слота — четыре товара в сетке), и привязку типа кожи к слоту.
              </p>
            )}
            {recommendedProductPreview?.status === 'fetch_failed' && (
              <p className="mt-2 text-xs leading-snug text-amber-800/90 sm:text-sm">
                Не удалось загрузить карточку товара. Обновите страницу или проверьте настройки доступа к каталогу.
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
              {[1, 2].map((n) => {
                const url = n === 1 ? recommendedProductPreview?.thumb1 : recommendedProductPreview?.thumb2;
                const st = recommendedProductPreview?.status;
                const emptyLabel =
                  recommendedProductPreview === null
                    ? 'Загрузка...'
                    : st === 'no_slot'
                      ? '—'
                      : st === 'fetch_failed'
                        ? '—'
                        : n === 1
                          ? 'Нет фото'
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
            Баллы: Увл. {scores[1] >= 0 ? `+${scores[1]}` : scores[1]} · Чувств. {scores[2] >= 0 ? `+${scores[2]}` : scores[2]} · Пигм. {scores[3] >= 0 ? `+${scores[3]}` : scores[3]} · Возраст. {scores[4] >= 0 ? `+${scores[4]}` : scores[4]}
          </p>

          {/* Фокус ухода */}
          <div className="mt-6">
            <p className="text-sm font-medium tracking-wide text-slate-600">
              Фокус ухода
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {info.concerns.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-brand/30 bg-brand-soft/30 px-4 py-1.5 text-sm text-slate-800"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* CTA: 모바일·데스크톱 모두 가로 2칸(한 줄) */}
          <div className="mt-10 flex flex-col items-center gap-3">
            {!userId && (
              <p className="max-w-md text-center text-sm text-slate-600">
                Сохраните результат в личном кабинете и пройдите тест ещё раз после регистрации.
              </p>
            )}
            <div className="mx-auto flex w-full max-w-md flex-row items-stretch justify-center gap-2 sm:max-w-lg sm:gap-3">
              <Link
                to={getRecommendationPath(result.type)}
                className={`inline-flex min-h-11 items-center justify-center rounded-full border border-brand bg-white px-3 py-2.5 text-center text-xs font-medium text-brand transition hover:bg-brand-soft/25 sm:px-4 sm:text-sm ${
                  canAddRecommendedToCart ? 'min-w-0 flex-1 basis-0' : 'w-full max-w-[240px]'
                }`}
              >
                Смотреть товары
              </Link>
              {canAddRecommendedToCart && (
                <button
                  type="button"
                  onClick={handleAddRecommendedToCart}
                  className="inline-flex min-h-11 min-w-0 flex-1 basis-0 items-center justify-center rounded-full border border-transparent bg-brand px-3 py-2.5 text-center text-xs font-medium text-white transition hover:bg-brand/90 sm:px-4 sm:text-sm"
                >
                  В корзину
                </button>
              )}
            </div>
            {!userId && (
              <Link
                to="/login"
                className="w-full max-w-[240px] rounded-full bg-slate-800 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-slate-700"
              >
                Зарегистрироваться! Всего 10 секунд!
              </Link>
            )}
          </div>

          {cartToast && (
            <div
              className="fixed left-1/2 z-50 max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg max-md:bottom-[calc(var(--semo-mobile-tabbar-h)+0.5rem)] md:bottom-8"
              role="status"
            >
              Добавлен в корзину
            </div>
          )}
        </div>
      </main>
    );
  }

  return null;
};
