import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';
import { AuthInitializingScreen } from '../components/SemoPageSpinner';
import { approximateScoresFromSkinTypeCode } from '../data/skinTestData';
import { formatSkinTypeShort } from '../lib/skinTypeDisplay';
import { hasSelfieAnalysisSnapshot, selfieAnalysisToClientState } from '../lib/skinTestSelfie';
import { fetchShippingAddressRow, shippingRowToFormFields } from '../lib/profileDeliveryDb';
import { isShippingComplete } from '../lib/shippingValidation';

type DbProfileState = {
  name: string | null;
  grade: string;
  points: number;
  telegram_id: string | null;
  phone: string | null;
};

type ProfileMemCacheEntry = {
  dbProfile: DbProfileState | null;
  membershipTier: 'basic' | 'premium' | 'family';
  updatedAt: number;
};

type SkinSummaryState = {
  id: string;
  skin_type: string | null;
  completed_at: string;
  baumann_scores?: unknown;
  selfie_analysis?: unknown;
};

const EMPTY_SKIN_SCORES: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

function parseBaumannScores(raw: unknown, skinType: string | null): Record<1 | 2 | 3 | 4, number> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      value = null;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const read = (key: '1' | '2' | '3' | '4') => {
      const n = Number(obj[key]);
      return Number.isFinite(n) ? Math.max(-10, Math.min(10, n)) : 0;
    };
    return { 1: read('1'), 2: read('2'), 3: read('3'), 4: read('4') };
  }
  return skinType ? approximateScoresFromSkinTypeCode(skinType) : EMPTY_SKIN_SCORES;
}

// ─── 피부 타입별 공감 인사이트 (Baumann 16조합) ─────────────────
const SKIN_INSIGHTS: Record<string, { ru: string; en: string }> = {
  // ── 지성(O) ────────────────────────────────────────────────────
  OSPW: {
    ru: 'После умывания кожа ощущается стянутой, но уже через пару часов начинает блестеть — классический признак обезвоженной жирной кожи. Воспаления оставляют тёмные следы надолго, а к вечеру макияж нередко «плывёт».',
    en: 'Skin feels tight after cleansing but turns shiny within hours — a hallmark of dehydrated-oily skin. Blemishes leave dark marks that linger for months, and makeup often doesn\'t last the day.',
  },
  OSPT: {
    ru: 'Кожа активно блестит, легко краснеет от новых средств или стресса, а любое воспаление оставляет след. Зато упругость хорошая — морщины пока не беспокоят.',
    en: 'Skin gets shiny quickly and reddens easily from new products or stress; any blemish tends to leave a mark. The bright side: firmness is good and wrinkles aren\'t a concern yet.',
  },
  OSNW: {
    ru: 'Кожа реагирует на многое: краснеет, щиплет, не принимает новые средства — и при этом ещё блестит в течение дня. Тон ровный, но со временем появляются первые признаки потери упругости.',
    en: 'Skin reacts to a lot — redness, stinging, trouble with new products — and gets shiny throughout the day too. Skin tone is even, but early signs of aging are starting to show.',
  },
  OSNT: {
    ru: 'Жирная и чувствительная, но упругая кожа с ровным тоном — главная проблема это блеск и периодическое раздражение. Уход должен быть лёгким и без лишних ингредиентов.',
    en: 'Oily and sensitive but firm, with an even tone — the main challenge is shine and occasional irritation. A light, minimal routine works best.',
  },
  ORPW: {
    ru: 'Кожа выносливая и хорошо переносит уход, но поры стали заметнее, тон потускнел, и появились первые морщины. Хорошая новость — ретинол и кислоты кожа принимает без протестов.',
    en: 'Resilient skin that handles most products well, but pores are enlarging, tone is uneven, and first wrinkles are appearing. The good news: retinol and acids are well tolerated.',
  },
  ORPT: {
    ru: 'Жирная и стойкая кожа с хорошей упругостью — но неровный тон и следы от воспалений не дают радоваться полностью. Кислоты и осветляющие средства хорошо переносятся и дают результат.',
    en: 'Oily and resilient with good firmness — but uneven tone and post-blemish marks are the main frustration. Acids and brightening actives are well tolerated and effective.',
  },
  ORNW: {
    ru: 'Кожа жирная и выносливая, тон радует своей ровностью — но с возрастом заметна потеря упругости. Самое время для профилактики: ретинол и антиоксиданты кожа воспримет хорошо.',
    en: 'Oily and resilient with an even tone — but firmness is starting to decrease with age. A great time for prevention: retinol and antioxidants are well tolerated.',
  },
  ORNT: {
    ru: 'Одна из наиболее беспроблемных комбинаций: жирная, выносливая, с ровным тоном и хорошей упругостью. Главная задача — контролировать блеск и поры, не перегружая кожу лишними средствами.',
    en: 'One of the most low-maintenance combinations: oily, resilient, even-toned and firm. The main goal is managing shine and pores without overloading the skin.',
  },
  // ── 건성(D) ────────────────────────────────────────────────────
  DSPW: {
    ru: 'Кожа стягивается после умывания, может шелушиться и краснеть от малейшего раздражителя — а поверх этого ещё пятна и морщины. Тональный крем ложится неровно на сухие участки. Уход нужен мягкий, питательный и с защитой от UV.',
    en: 'Skin feels tight after cleansing, may flake and redden from the slightest irritant — plus pigmentation and wrinkles add to the picture. Foundation tends to settle unevenly on dry patches. Gentle, nourishing, UV-protective care is essential.',
  },
  DSPT: {
    ru: 'Кожа сухая и реактивная: стягивается, шелушится, реагирует на новые средства — и при этом склонна к пятнам и неровному тону. Зато упругость хорошая, морщины пока не беспокоят.',
    en: 'Dry and reactive: tight, flaky, sensitive to new products — and prone to pigmentation spots. The upside: firmness is good and wrinkles aren\'t a concern yet.',
  },
  DSNW: {
    ru: 'Кожа тонкая, сухая и очень чувствительная — легко раздражается, шелушится, и при этом начинает терять упругость. Тон ровный — это радует, но бережный уход с питательными компонентами здесь обязателен.',
    en: 'Thin, dry and very sensitive — irritates easily, flakes, and is starting to lose firmness. Skin tone is even, which is a plus, but gentle nourishing care is a must.',
  },
  DSNT: {
    ru: 'Сухая чувствительная кожа, которая стягивается после умывания и краснеет от ветра или нового крема. Хорошо то, что тон ровный и упругость в порядке — уход должен быть простым и успокаивающим.',
    en: 'Dry, sensitive skin that tightens after cleansing and reddens from wind or a new cream. The good news: even tone and good firmness. Keep the routine simple and soothing.',
  },
  DRPW: {
    ru: 'Кожа сухая, с заметными возрастными изменениями: морщины, неровный тон, потеря упругости. Зато выносливая — хорошо реагирует на активный уход с ретинолом, витамином С и пептидами.',
    en: 'Dry skin with visible aging signs: wrinkles, uneven tone, loss of firmness. But resilient — it responds well to actives like retinol, vitamin C, and peptides.',
  },
  DRPT: {
    ru: 'Кожа сухая, но стойкая: хорошо переносит большинство средств, упругость в порядке. Главный вопрос — сухость и неравномерный тон. Кислоты и осветляющие сыворотки здесь будут кстати.',
    en: 'Dry but resilient: tolerates most products well, firmness is good. Main concerns: dryness and uneven pigmented tone. Acids and brightening serums work well here.',
  },
  DRNW: {
    ru: 'Кожа сухая и начинает показывать возраст — морщины и потеря тонуса становятся заметнее. Зато тон ровный и кожа стойкая, хорошо принимает активный уход. Приоритет — питание и ретинол.',
    en: 'Dry skin that\'s aging — wrinkles and loss of firmness are becoming visible. But tone is even and resilient skin responds well to actives. Priority: nourishment and retinol.',
  },
  DRNT: {
    ru: 'Кожа сухая, но в целом всё хорошо: ровный тон, хорошая упругость, никакой особой реактивности. Единственная задача — восполнять влагу и питать кожу достаточно.',
    en: 'Dry skin, but overall in great shape: even tone, good firmness, no particular reactivity. The only task is keeping skin well-hydrated and nourished.',
  },
};

function getSkinInsightText(scores: Record<1 | 2 | 3 | 4, number>, isEn: boolean): string {
  const key = [
    scores[1] < 0 ? 'O' : 'D',
    scores[2] > 0 ? 'S' : 'R',
    scores[3] > 0 ? 'P' : 'N',
    scores[4] > 0 ? 'W' : 'T',
  ].join('');
  const insight = SKIN_INSIGHTS[key];
  if (!insight) return isEn ? 'Take the test to see your skin profile.' : 'Пройдите тест для персонального профиля.';
  return isEn ? insight.en : insight.ru;
}

type SkinAxisCardInfo = {
  categoryLabel: string;
  label: string;
  hint: string;
  bg: string;
  border: string;
  text: string;
  sub: string;
  dotColor: string;
  dots: number;
};

function buildSkinOneLiner(scores: Record<1 | 2 | 3 | 4, number>, isEn: boolean): string {
  // 부호 규칙: 축1 음수=지성, 양수=건성 / 축2 양수=민감, 음수=강함 / 축3 양수=색소, 음수=균일 / 축4 양수=주름, 음수=탄력
  const axes: { idx: 1 | 2 | 3 | 4; abs: number }[] = ([1, 2, 3, 4] as const).map((i) => ({
    idx: i,
    abs: Math.abs(scores[i]),
  }));
  axes.sort((a, b) => b.abs - a.abs);

  const axisLabel = (idx: 1 | 2 | 3 | 4): string => {
    const s = scores[idx];
    if (idx === 1) return s < 0 ? (isEn ? 'oily' : 'жирная') : (isEn ? 'dry' : 'сухая');
    if (idx === 2) return s > 0 ? (isEn ? 'sensitive' : 'чувствительная') : (isEn ? 'resilient' : 'устойчивая');
    if (idx === 3) return s > 0 ? (isEn ? 'pigmented' : 'с пигментацией') : (isEn ? 'even tone' : 'ровный тон');
    return s > 0 ? (isEn ? 'aging' : 'возрастная') : (isEn ? 'firm' : 'упругая');
  };

  const top = axes.slice(0, 2).map(({ idx }) => axisLabel(idx));

  const hintMap: Record<string, string> = {
    'жирная+чувствительная':  'лёгкие гели без отдушек, низкий pH',
    'жирная+устойчивая':      'лёгкие гели и кислотные тонеры',
    'жирная+с пигментацией':  'ниацинамид, AHA-кислоты и SPF',
    'жирная+возрастная':      'лёгкие сыворотки с ретинолом и SPF',
    'сухая+чувствительная':   'мягкие увлажняющие средства без отдушек',
    'сухая+устойчивая':       'питательные кремы и масла',
    'сухая+с пигментацией':   'увлажнение + витамин С для выравнивания тона',
    'сухая+возрастная':       'плотный крем с ретинолом и пептидами',
    'oily+sensitive':         'light fragrance-free gels, low pH cleansers',
    'oily+resilient':         'light gels and gentle exfoliating toners',
    'oily+pigmented':         'niacinamide, AHA acids and SPF',
    'oily+aging':             'lightweight retinol serums and SPF',
    'dry+sensitive':          'gentle fragrance-free moisturisers',
    'dry+resilient':          'nourishing creams and facial oils',
    'dry+pigmented':          'hydration + vitamin C for even tone',
    'dry+aging':              'rich retinol cream and peptides',
  };
  const key = top.join('+');
  const hint = hintMap[key] ?? (isEn ? 'build a personalised box' : 'собери персональный бокс');
  const typeStr = top[0] ?? '';
  const capitalised = typeStr.charAt(0).toUpperCase() + typeStr.slice(1);
  return isEn
    ? `${capitalised}${top[1] ? ` & ${top[1]}` : ''} skin — ${hint}`
    : `${capitalised}${top[1] ? ` · ${top[1]}` : ''} — ${hint}`;
}

function getSkinAxisCard(axisIdx: 1 | 2 | 3 | 4, score: number, isEn: boolean): SkinAxisCardInfo {
  const abs = Math.abs(score);
  const dots = abs >= 4 ? 5 : abs >= 3 ? 4 : abs >= 2 ? 3 : abs >= 1 ? 2 : 1;

  // 부호 규칙: 축1 음수=지성, 양수=건성 / 축2 양수=민감, 음수=강함 / 축3 양수=색소, 음수=균일 / 축4 양수=주름, 음수=탄력
  if (axisIdx === 1) {
    const categoryLabel = isEn ? 'Oiliness' : 'Жирность';
    if (score < 0) return { categoryLabel, label: isEn ? 'Oily' : 'Жирная', hint: isEn ? 'Light gel texture, foam cleanser' : 'Лёгкий гель, пенка для умывания', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-900', sub: 'text-amber-700', dotColor: '#f59e0b', dots };
    return { categoryLabel, label: isEn ? 'Dry' : 'Сухая', hint: isEn ? 'Rich cream, oil-based cleanser' : 'Жирный крем, масляный клинсер', bg: 'bg-sky-50', border: 'border-sky-200', text: 'text-sky-900', sub: 'text-sky-600', dotColor: '#0ea5e9', dots };
  }
  if (axisIdx === 2) {
    const categoryLabel = isEn ? 'Sensitivity' : 'Чувствит.';
    if (score > 0) return { categoryLabel, label: isEn ? 'Sensitive' : 'Чувствительная', hint: isEn ? 'Fragrance-free, gentle formulas' : 'Без отдушек, мягкие формулы', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-900', sub: 'text-rose-700', dotColor: '#f43f5e', dots };
    return { categoryLabel, label: isEn ? 'Resilient' : 'Устойчивая', hint: isEn ? 'Tolerates most formulas well' : 'Хорошо переносит большинство средств', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', sub: 'text-emerald-700', dotColor: '#10b981', dots };
  }
  if (axisIdx === 3) {
    const categoryLabel = isEn ? 'Pigment' : 'Пигментация';
    if (score > 0) return { categoryLabel, label: isEn ? 'Pigmented' : 'Пигментация', hint: isEn ? 'Niacinamide, vitamin C, SPF' : 'Ниацинамид, витамин С, SPF', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', sub: 'text-purple-700', dotColor: '#a855f7', dots };
    return { categoryLabel, label: isEn ? 'Even tone' : 'Ровный тон', hint: isEn ? 'Antioxidants + SPF for maintenance' : 'Антиоксиданты и SPF для профилактики', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', sub: 'text-emerald-700', dotColor: '#10b981', dots };
  }
  const categoryLabel = isEn ? 'Aging' : 'Возраст';
  if (score > 0) return { categoryLabel, label: isEn ? 'Aging' : 'Возрастная', hint: isEn ? 'Retinol, peptides, rich moisturiser' : 'Ретинол, пептиды, плотный крем', bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-900', sub: 'text-violet-700', dotColor: '#8b5cf6', dots };
  return { categoryLabel, label: isEn ? 'Firm' : 'Упругая', hint: isEn ? 'Light antioxidants for prevention' : 'Антиоксиданты для профилактики', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-900', sub: 'text-emerald-700', dotColor: '#10b981', dots };
}

// 페이지 전환(리마운트) 시 0.1초 정도 스켈레톤이 보이는 문제를 완화하기 위한
// "세션 동안만" 메모리 캐시(브라우저 영구 저장 X).
const PROFILE_MEM_CACHE_TTL_MS = 60_000;
const PROFILE_MEM_CACHE = new Map<string, ProfileMemCacheEntry>();

/**
 * 로그인된 사용자 개인화면 — 인사/등급/포인트 박스.
 * 이름·등급(표시)·포인트의 유일한 근거는 Supabase `profiles`(및 주문 기반 membershipTier) — 브라우저에 이름/포인트를 캐시하지 않음.
 */
export const Profile: React.FC = () => {
  const {
    userEmail,
    userId,
    setUserEmail,
    isLoggedIn,
    initialized,
    isAdmin,
    refreshEmailConfirmationFromServer,
  } = useAuth();
  const { language, country, setCountry } = useI18n();
  const tr = useCallback((ru: string, en: string) => (language === 'en' ? en : ru), [language]);

  // 메모리 캐시(세션 내)로 인해 리마운트 순간에도 이름/포인트 등이 즉시 채워지도록 함
  const memCache = userId ? PROFILE_MEM_CACHE.get(userId) ?? null : null;
  const cacheFresh = memCache ? Date.now() - memCache.updatedAt < PROFILE_MEM_CACHE_TTL_MS : false;
  const initialDbProfile = cacheFresh ? memCache?.dbProfile ?? null : null;
  const initialMembershipTier = cacheFresh ? memCache?.membershipTier ?? 'basic' : 'basic';

  // 데스크탑 상단: 배송받을 국가(플래그) — I18nContext(country)로 localStorage에 유지
  const [deliveryCountryOpen, setDeliveryCountryOpen] = useState(false);
  const deliveryCountryWrapRef = useRef<HTMLDivElement | null>(null);
  const deliveryCountryOptions = useMemo(
    () =>
      [
        { code: 'RU', emoji: '🇷🇺', ru: 'Россия', en: 'Russia', short: 'RUS' },
        { code: 'KZ', emoji: '🇰🇿', ru: 'Казахстан', en: 'Kazakhstan', short: 'KAZ' },
        { code: 'AE', emoji: '🇦🇪', ru: 'ОАЭ', en: 'UAE', short: 'UAE' },
        { code: 'UZ', emoji: '🇺🇿', ru: 'Узбекистан', en: 'Uzbekistan', short: 'UZB' },
      ] as const,
    [],
  );
  const selectedDelivery =
    deliveryCountryOptions.find((o) => o.code === country) ?? deliveryCountryOptions[0];

  useEffect(() => {
    if (!deliveryCountryOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = deliveryCountryWrapRef.current;
      if (!el) return setDeliveryCountryOpen(false);
      if (!el.contains(e.target as Node)) setDeliveryCountryOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [deliveryCountryOpen]);
  const [dbProfile, setDbProfile] = useState<DbProfileState | null>(initialDbProfile);
  /** 회원 등급: basic(일반) / premium(프리미엄) / family(가족) — 주문 누계 기준으로 계산 */
  const [membershipTier, setMembershipTier] = useState<'basic' | 'premium' | 'family'>(initialMembershipTier);
  const [lastSkinType, setLastSkinType] = useState<string | null>(null);
  const [skinSummary, setSkinSummary] = useState<SkinSummaryState | null>(null);
  /** 저장된 결과 중 셀카 분석 없음(설문만) 건수 — Tests 타일 배지용 */
  const [skinTestWithoutSelfieCount, setSkinTestWithoutSelfieCount] = useState(0);
  /** null = 조회 중, true = 배송 정보 완료, false = 미완료(배지 표시) */
  const [shippingComplete, setShippingComplete] = useState<boolean | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = userId;

  const refreshProfile = useCallback((): Promise<void> => {
    if (!supabase || !userId) {
      setDbProfile(null);
      return Promise.resolve();
    }
    const requestedUserId = userId;

    const applyRow = (data: {
      name?: string | null;
      grade?: string | null;
      points?: number | null;
      telegram_id?: string | null;
      phone?: string | null;
    } | null) => {
      if (currentUserIdRef.current !== requestedUserId) return;
      const nextTelegramId = data?.telegram_id ?? null;

      const nextDbProfile: DbProfileState | null = data
        ? {
            name: data.name ?? '',
            grade: data.grade ?? tr('Обычный участник', 'Regular member'),
            points: data.points ?? 0,
            telegram_id: nextTelegramId,
            phone: data.phone ?? null,
          }
        : null;

      setDbProfile(nextDbProfile);
      PROFILE_MEM_CACHE.set(requestedUserId, {
        dbProfile: nextDbProfile,
        membershipTier: PROFILE_MEM_CACHE.get(requestedUserId)?.membershipTier ?? 'basic',
        updatedAt: Date.now(),
      });
    };

    return (async () => {
      try {
        const res = await supabase
          .from('profiles')
          .select('name, grade, points, phone, telegram_id, telegram_reward_given')
          .eq('id', userId)
          .single();

        if (res.error || !res.data) {
          if (currentUserIdRef.current !== requestedUserId) return;
          applyRow(null);
          return;
        }

        applyRow(res.data);
      } catch {
        if (currentUserIdRef.current !== requestedUserId) return;
        applyRow(null);
      }
    })();
  }, [userId]);

  // userId 있을 때만 프로필 조회. 조회 전에 null로 비우지 않음 — 실패 시 이전 연동 상태(텔레그램 등) 유지
  useEffect(() => {
    if (!userId) {
      setDbProfile(null);
      return;
    }
    void refreshProfile();
  }, [refreshProfile, userId]);

  useEffect(() => {
    if (!supabase || !userId) {
      setShippingComplete(null);
      return;
    }
    let cancelled = false;
    void fetchShippingAddressRow(supabase, userId).then((row) => {
      if (cancelled) return;
      setShippingComplete(isShippingComplete(shippingRowToFormFields(row)));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 마지막 тип кожи + 셀카 미완료 건수 + 홈 요약 패널용 점수
  useEffect(() => {
    if (!supabase || !userId) {
      setLastSkinType(null);
      setSkinSummary(null);
      setSkinTestWithoutSelfieCount(0);
      return;
    }
    supabase
      .from('skin_test_results')
      .select('id, skin_type, completed_at, baumann_scores, selfie_analysis')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const sorted = (
            data as {
              id: string;
              skin_type: string | null;
              completed_at: string;
              baumann_scores?: unknown;
              selfie_analysis?: unknown;
            }[]
          )
            .slice()
            .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
          setLastSkinType(sorted[0].skin_type ?? null);
          setSkinSummary(sorted[0] ?? null);
          const n = sorted.filter((r) => !hasSelfieAnalysisSnapshot(r.selfie_analysis)).length;
          setSkinTestWithoutSelfieCount(n);
        } else {
          setLastSkinType(null);
          setSkinSummary(null);
          setSkinTestWithoutSelfieCount(0);
        }
      })
      .catch(() => {
        setLastSkinType(null);
        setSkinSummary(null);
        setSkinTestWithoutSelfieCount(0);
      });
  }, [userId]);

  // 주문 누계 기준 등급 계산: 완료된(배송완료/구매확정) 주문만 집계, 테스트 주문 제외
  useEffect(() => {
    if (!supabase || !userId) {
      setMembershipTier('basic');
      return;
    }
    supabase
      .from('orders')
      .select('total_cents, status, is_test')
      .eq('user_id', userId)
      .in('status', ['delivered', 'confirmed'])
      .then(({ data }) => {
        const rows = (data ?? []) as { total_cents?: number | null; status?: string | null; is_test?: boolean | null }[];
        const sumCents = rows
          .filter((o) => !o.is_test)
          .reduce((acc, o) => acc + (o.total_cents ?? 0), 0);
        const sumRub = sumCents / 100;
        const nextTier: 'basic' | 'premium' | 'family' = sumRub >= 100_000 ? 'family' : sumRub >= 35_000 ? 'premium' : 'basic';
        setMembershipTier(nextTier);
        const prev = PROFILE_MEM_CACHE.get(userId);
        if (prev) {
          PROFILE_MEM_CACHE.set(userId, { ...prev, membershipTier: nextTier, updatedAt: Date.now() });
        }
      })
      .catch(() => {
        setMembershipTier('basic');
        const prev = PROFILE_MEM_CACHE.get(userId);
        if (prev) {
          PROFILE_MEM_CACHE.set(userId, { ...prev, membershipTier: 'basic', updatedAt: Date.now() });
        }
      });
  }, [userId]);

  // 다른 탭으로 돌아오면 프로필 다시 불러오기
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshProfile();
        void refreshEmailConfirmationFromServer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshProfile, refreshEmailConfirmationFromServer]);

  // profiles.email_verified_at 동기화(AuthContext) — JWT/auth만 보면 Confirm OFF 시 오표시
  useEffect(() => {
    if (!userId) return;
    void refreshEmailConfirmationFromServer();
  }, [userId, refreshEmailConfirmationFromServer]);

  /**
   * 표시용 이름: DB 조회 완료 후에만 결정.
   * - profiles.name 이 있으면 그대로
   * - 없으면 이메일 @ 앞부분(가입 시 AuthContext가 DB에 넣은 값과 동일할 수 있음)
   * 로딩 중(dbProfile === null)에는 이메일 조각을 쓰지 않음 — 다른 계정처럼 보이는 착시 방지
   */
  const displayName =
    dbProfile === null
      ? null
      : (dbProfile.name && String(dbProfile.name).trim()) ||
        (userEmail ? userEmail.split('@')[0] : tr('SEMO клиент', 'SEMO customer'));
  /** 포인트: DB 조회 완료 후에만 숫자 표시(로딩 중 스켈레톤) */
  const pointsLoaded = dbProfile !== null;
  const displayPoints = dbProfile?.points ?? 0;
  const skinScores = skinSummary
    ? parseBaumannScores(skinSummary.baumann_scores, skinSummary.skin_type)
    : EMPTY_SKIN_SCORES;
  const skinSummaryHasSelfie = skinSummary ? hasSelfieAnalysisSnapshot(skinSummary.selfie_analysis) : false;
  const skinSummarySelfie = skinSummary ? selfieAnalysisToClientState(skinSummary.selfie_analysis) : null;
  const skinSummarySelfieMetrics = skinSummarySelfie?.skin_metrics ?? null;
  const skinSummaryHref = skinSummary ? '/profile/skin-care' : '/skin-test';
  const skinSummaryLabel = formatSkinTypeShort(skinSummary?.skin_type, language === 'en');
  const miniSkinAxes = useMemo(
    () =>
      language === 'en'
        ? [
            { label: 'Dry/Oil', left: 'D', right: 'O', value: skinScores[1] },
            { label: 'Sensitive', left: 'S', right: 'R', value: skinScores[2] },
            { label: 'Pigment', left: 'P', right: 'N', value: skinScores[3] },
            { label: 'Wrinkle', left: 'T', right: 'W', value: skinScores[4] },
          ]
        : [
            { label: 'Сух./жирн.', left: 'D', right: 'O', value: skinScores[1] },
            { label: 'Чувств.', left: 'S', right: 'R', value: skinScores[2] },
            { label: 'Пигмент', left: 'P', right: 'N', value: skinScores[3] },
            { label: 'Возраст', left: 'T', right: 'W', value: skinScores[4] },
          ],
    [language, skinScores],
  );

  /** DB `profiles.is_admin` 기준 — VIP 등급 라벨·스타일 */
  const isVipAdminAccount = isAdmin;
  const tierTriangleGradientId = isVipAdminAccount
    ? 'tier-gold-metal'
    : membershipTier === 'family'
      ? 'tier-gold-metal'
      : membershipTier === 'premium'
        ? 'tier-silver-metal'
        : 'tier-bronze-metal';
  const tierTooltipText = isVipAdminAccount
    ? tr('VIP уровень', 'VIP tier')
    : membershipTier === 'family'
      ? tr('Gold уровень', 'Gold tier')
      : membershipTier === 'premium'
        ? tr('Silver уровень', 'Silver tier')
        : tr('Bronze уровень', 'Bronze tier');
  const tierLabelShort = isVipAdminAccount
    ? 'VIP'
    : membershipTier === 'family'
      ? 'Gold'
      : membershipTier === 'premium'
        ? 'Silver'
        : 'Bronze';

  if (!initialized) return <AuthInitializingScreen />;
  if (!isLoggedIn || !userEmail) return <Navigate to="/login" replace />;

  const handleLogout = async () => {
    setUserEmail(null);
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore
      }
    }
    // 완전히 새로고침하여 세션·상태를 초기화
    window.location.href = '/login';
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
        <h1 className="min-w-0 text-lg font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {tr('Личный кабинет', 'Account')}
        </h1>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              replace
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
            >
              관리메뉴
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            {tr('Выйти', 'Logout')}
          </button>
        </div>
      </header>

      {/* 연한 주황(brand-soft) 박스 — 예전 Telegram/이메일 인증 카드 톤과 동일 */}
      <div className="rounded-xl border border-brand/25 bg-brand-soft/95 px-3 py-4 shadow-sm ring-1 ring-brand/10 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-words text-center text-base font-medium text-slate-800 sm:text-left sm:text-lg">
            {displayName == null ? tr('Здравствуйте!', 'Hello!') : language === 'en' ? `Hello, ${displayName}!` : `Здравствуйте, ${displayName}!`}
          </p>
          {/* 웹: 인사와 같은 행 우측 */}
          <div className="hidden shrink-0 flex-row items-center justify-end gap-2 sm:flex">
            {/* 데스크탑: 배송받을 국가(플래그) — tier 버튼 왼쪽 */}
            <div ref={deliveryCountryWrapRef} className="relative">
              <button
                type="button"
                onClick={() => setDeliveryCountryOpen((v) => !v)}
                className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-brand/25 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-brand-soft/55 focus:outline-none focus:ring-1 focus:ring-brand"
                aria-label={tr('Страна доставки', 'Delivery country')}
                title={tr('Страна доставки', 'Delivery country')}
              >
                <div className="flex h-[20px] w-full shrink-0 items-center justify-center" aria-hidden>
                  <span className="text-[22px] leading-none">{selectedDelivery.emoji}</span>
                </div>
                <div className="h-[14px] w-full flex items-end justify-center">
                  <span className="text-center text-[10px] font-semibold leading-none text-slate-600">
                    {selectedDelivery.short}
                  </span>
                </div>
              </button>
              {deliveryCountryOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                  <div className="px-3 pt-2 pb-1 text-[11px] font-medium text-slate-500">
                    {tr('Выберите страну доставки', 'Select delivery country')}
                  </div>
                  <div className="max-h-56 overflow-y-auto px-1 pb-1">
                    {deliveryCountryOptions.map((opt) => {
                      const active = opt.code === country;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => {
                            setCountry(opt.code);
                            setDeliveryCountryOpen(false);
                          }}
                          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                            active ? 'bg-brand-soft/35 font-semibold text-brand' : 'text-slate-700 hover:bg-slate-100'
                          }`}
                          aria-pressed={active}
                        >
                          <span aria-hidden className="text-[18px] leading-none">
                            {opt.emoji}
                          </span>
                          <span className="truncate">{language === 'en' ? opt.en : opt.ru}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <Link
              to="/profile/tier"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-brand/25 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-brand-soft/55"
              aria-label={tr('Уровень участника', 'Membership tier')}
              title={tierTooltipText}
            >
              <div className="flex h-[18px] w-full shrink-0 items-center justify-center">
                {isVipAdminAccount ? (
                  <span className="bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-700 bg-clip-text text-[11px] font-bold leading-none text-transparent">
                    VIP
                  </span>
                ) : (
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <defs>
                      <linearGradient id="tier-bronze-metal" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#F2C189" />
                        <stop offset="0.45" stopColor="#C07A3A" />
                        <stop offset="1" stopColor="#7A3E10" />
                      </linearGradient>
                      <linearGradient id="tier-silver-metal" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#F1F5F9" />
                        <stop offset="0.45" stopColor="#A8B4C3" />
                        <stop offset="1" stopColor="#667487" />
                      </linearGradient>
                      <linearGradient id="tier-gold-metal" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#FFF4BF" />
                        <stop offset="0.45" stopColor="#F1C94B" />
                        <stop offset="1" stopColor="#B88509" />
                      </linearGradient>
                    </defs>
                    <path d="M12 3L22 20H2L12 3Z" fill={`url(#${tierTriangleGradientId})`} />
                  </svg>
                )}
              </div>
              <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                <span className="text-center text-[10px] font-semibold leading-none text-slate-600">{tierLabelShort}</span>
              </div>
            </Link>
            <Link
              to="/profile/points"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-brand/25 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-brand-soft/55"
              aria-busy={!pointsLoaded}
            >
              {pointsLoaded ? (
                <>
                  <div className="flex h-[18px] w-full shrink-0 items-center justify-center" aria-hidden>
                    <span className="text-[17px] font-normal leading-none text-amber-500">★</span>
                  </div>
                  <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                    <span className="text-center text-[10px] font-semibold leading-none tabular-nums text-slate-700">{displayPoints}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-[18px] w-full shrink-0 items-center justify-center">
                    <span
                      className="inline-block h-3.5 min-w-[2.5rem] animate-pulse rounded bg-slate-200/90"
                      aria-hidden
                    />
                  </div>
                  <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                    <span
                      className="inline-block h-2 min-w-[1.25rem] animate-pulse rounded bg-slate-200/80"
                      aria-hidden
                    />
                  </div>
                </>
              )}
            </Link>
          </div>
          {/* 모바일: 인사 아래 가운데 정렬 */}
          <div className="flex shrink-0 flex-row items-center justify-center gap-2 sm:hidden">
            <Link
              to="/profile/tier"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-brand/25 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-brand-soft/55"
              aria-label={tr('Уровень участника', 'Membership tier')}
              title={tierTooltipText}
            >
              <div className="flex h-[18px] w-full shrink-0 items-center justify-center">
                {isVipAdminAccount ? (
                  <span className="bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-700 bg-clip-text text-[11px] font-bold leading-none text-transparent">
                    VIP
                  </span>
                ) : (
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <defs>
                      <linearGradient id="tier-bronze-metal-mobile" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#F2C189" />
                        <stop offset="0.45" stopColor="#C07A3A" />
                        <stop offset="1" stopColor="#7A3E10" />
                      </linearGradient>
                      <linearGradient id="tier-silver-metal-mobile" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#F1F5F9" />
                        <stop offset="0.45" stopColor="#A8B4C3" />
                        <stop offset="1" stopColor="#667487" />
                      </linearGradient>
                      <linearGradient id="tier-gold-metal-mobile" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                        <stop offset="0" stopColor="#FFF4BF" />
                        <stop offset="0.45" stopColor="#F1C94B" />
                        <stop offset="1" stopColor="#B88509" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M12 3L22 20H2L12 3Z"
                      fill={
                        membershipTier === 'family'
                          ? 'url(#tier-gold-metal-mobile)'
                          : membershipTier === 'premium'
                          ? 'url(#tier-silver-metal-mobile)'
                          : 'url(#tier-bronze-metal-mobile)'
                      }
                    />
                  </svg>
                )}
              </div>
              <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                <span className="text-center text-[10px] font-semibold leading-none text-slate-600">{tierLabelShort}</span>
              </div>
            </Link>
            <Link
              to="/profile/points"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-brand/25 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-brand-soft/55"
              aria-busy={!pointsLoaded}
            >
              {pointsLoaded ? (
                <>
                  <div className="flex h-[18px] w-full shrink-0 items-center justify-center" aria-hidden>
                    <span className="text-[16px] font-normal leading-none text-amber-500">★</span>
                  </div>
                  <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                    <span className="text-center text-[10px] font-semibold leading-none tabular-nums text-slate-700">{displayPoints}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-[18px] w-full shrink-0 items-center justify-center">
                    <span
                      className="inline-block h-3.5 min-w-[2.5rem] animate-pulse rounded bg-slate-200/90"
                      aria-hidden
                    />
                  </div>
                  <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                    <span
                      className="inline-block h-2 min-w-[1.25rem] animate-pulse rounded bg-slate-200/80"
                      aria-hidden
                    />
                  </div>
                </>
              )}
            </Link>
          </div>
        </div>
      </div>

      <Link
        to={skinSummaryHref}
        className="mt-4 block rounded-xl border border-brand/25 bg-brand-soft/95 px-3 py-4 shadow-sm ring-1 ring-brand/10 transition hover:border-brand/40 hover:bg-brand-soft sm:mt-5 sm:px-6 sm:py-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-slate-900 sm:text-base">
                {tr('Мой профиль кожи', 'My skin profile')}
              </p>
              {skinSummary?.skin_type ? (
                <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold tracking-widest text-brand ring-1 ring-brand/20">
                  {skinSummary.skin_type.toUpperCase()}
                </span>
              ) : null}
              {skinSummary && !skinSummaryHasSelfie ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                  {tr('Нужно селфи', 'Add selfie')}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs italic leading-relaxed text-slate-500 sm:text-sm">
              {skinSummary
                ? getSkinInsightText(skinScores, language === 'en')
                : tr('Пройдите тест, чтобы увидеть персональный профиль кожи.', 'Take the test to see your personal skin profile.')}
            </p>
          </div>

          {!skinSummary ? (
            <span className="inline-flex min-h-10 items-center justify-center rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white">
              {tr('Пройти тест', 'Start test')}
            </span>
          ) : null}
        </div>

        {skinSummary ? (
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([1, 2, 3, 4] as const).map((axisIdx) => {
              const score = Math.max(-10, Math.min(10, skinScores[axisIdx]));
              const card = getSkinAxisCard(axisIdx, score, language === 'en');
              return (
                <div key={axisIdx} className={`rounded-xl border ${card.border} ${card.bg} px-3 py-3`}>
                  <p className={`text-[10px] font-semibold uppercase tracking-wide ${card.text} opacity-60`}>
                    {card.categoryLabel}
                  </p>
                  <p className={`mt-1 text-sm font-semibold leading-snug ${card.text}`}>
                    {card.label}
                  </p>
                  <div className="mt-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 flex-1 rounded-full"
                        style={{ background: d <= card.dots ? card.dotColor : '#e5e7eb' }}
                      />
                    ))}
                  </div>
                  <p className={`mt-2 text-[10px] leading-snug ${card.sub}`}>{card.hint}</p>
                </div>
              );
            })}
          </div>
        ) : null}

        {skinSummary && skinSummaryHasSelfie && skinSummarySelfieMetrics ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [tr('Покраснение', 'Redness'), skinSummarySelfieMetrics.redness_index],
              [tr('Тон', 'Tone'), skinSummarySelfieMetrics.pigment_unevenness],
              [tr('Текстура', 'Texture'), skinSummarySelfieMetrics.texture_roughness],
              [tr('Блеск', 'Oiliness'), skinSummarySelfieMetrics.oiliness_index],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-white/70 px-3 py-2 text-xs">
                <span className="text-slate-500">{label}</span>
                <span className="float-right font-semibold tabular-nums text-slate-800">{Math.round(Number(value) || 0)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </Link>

      {/* 그래픽/아이콘 메뉴: 프로필·리뷰·쿠폰·주문 (카탈로그는 상단 네비 / SEMO Box에서만) */}
      <nav
        className="mt-5 grid grid-cols-2 gap-2 sm:mt-8 sm:grid-cols-4 sm:gap-3"
        aria-label="Profile menu"
      >
        <Link
          to="/profile/edit"
          className="relative flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10 sm:px-3.5 sm:py-3.5"
        >
          {shippingComplete === false ? (
            <span
              className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold leading-none text-slate-900 shadow-sm ring-2 ring-white sm:right-2 sm:top-2"
              aria-label={tr('Заполните данные доставки', 'Complete shipping details')}
              title={tr('Заполните данные доставки', 'Complete shipping details')}
            >
              !
            </span>
          ) : null}
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
          <div className="min-w-0 px-0.5">
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base whitespace-nowrap">{tr('Профиль', 'Profile')}</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs whitespace-nowrap">{tr('Личные данные', 'Personal data')}</p>
          </div>
        </Link>

        <Link
          to="/profile/reviews"
          className="flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10 sm:px-3.5 sm:py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </span>
          <div className="min-w-0 px-0.5">
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base whitespace-nowrap">{tr('Отзывы', 'Reviews')}</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs whitespace-nowrap">{tr('Мои отзывы о товарах', 'My product reviews')}</p>
          </div>
        </Link>

        <Link
          to="/profile/coupons"
          className="flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10 sm:px-3.5 sm:py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </span>
          <div className="min-w-0 px-0.5">
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base whitespace-nowrap">{tr('Купоны', 'Coupons')}</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs whitespace-nowrap">{tr('Скидки и сертификаты', 'Discounts & vouchers')}</p>
          </div>
        </Link>

        <Link
          to="/profile/orders"
          className="flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10 sm:px-3.5 sm:py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </span>
          <div className="min-w-0 px-0.5">
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base whitespace-nowrap">{tr('Заказы', 'Orders')}</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs whitespace-nowrap">{tr('История и статус', 'History and status')}</p>
          </div>
        </Link>

      </nav>
    </main>
  );
};
