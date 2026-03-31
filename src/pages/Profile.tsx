import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth, ADMIN_DUMMY_USER_ID } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';
import { resendSignupConfirmationEmail } from '../lib/authSignupResend';
import {
  accountCardSubtextClass,
  accountLinkTwoColGridClass,
  accountPrimaryCtaClass,
  accountStatusPillClass,
} from '../lib/accountLinkUi';
import { AuthInitializingScreen } from '../components/SemoPageSpinner';

/** 관리자 2계정은 등급 라벨을 VIP로 고정 표시 */
const VIP_ADMIN_EMAILS = ['dvanovic91@gmail.com', 'admin@semo-box.ru'];

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

// 페이지 전환(리마운트) 시 0.1초 정도 스켈레톤이 보이는 문제를 완화하기 위한
// "세션 동안만" 메모리 캐시(브라우저 영구 저장 X).
const PROFILE_MEM_CACHE_TTL_MS = 60_000;
const PROFILE_MEM_CACHE = new Map<string, ProfileMemCacheEntry>();

/** 세션 내 텔레그램 연동 여부 캐시 — 프로필 API 응답 전에도 버튼 깜빡임 완화 */
const TG_CACHE_PREFIX = 'semo_profile_tg_';
function readTelegramCache(userId: string): boolean | null {
  try {
    const v = sessionStorage.getItem(TG_CACHE_PREFIX + userId);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch {
    /* private mode */
  }
  return null;
}
function writeTelegramCache(userId: string, linked: boolean) {
  try {
    sessionStorage.setItem(TG_CACHE_PREFIX + userId, linked ? '1' : '0');
  } catch {
    /* */
  }
}

/**
 * 로그인된 사용자 개인화면 — 인사/등급/포인트 박스.
 * 이름·등급(표시)·포인트의 유일한 근거는 Supabase `profiles`(및 주문 기반 membershipTier) — 브라우저에 이름/포인트를 캐시하지 않음.
 * Telegram 연동 여부만 세션 스토리지로 깜빡임 완화(0/1 플래그, 개인정보 아님).
 */
export const Profile: React.FC = () => {
  const {
    userEmail,
    userId,
    setUserEmail,
    isLoggedIn,
    initialized,
    isAdmin,
    isEmailConfirmed,
    refreshEmailConfirmationFromServer,
  } = useAuth();
  const { language, country, setCountry } = useI18n();
  const tr = useCallback((ru: string, en: string) => (language === 'en' ? en : ru), [language]);

  // 메모리 캐시(세션 내)로 인해 리마운트 순간에도 이름/포인트/텔레그램 상태가 즉시 채워지도록 함
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
  /** 연동 성공 시 토스트 (다른 탭에서 연동 후 돌아왔을 때) */
  const [telegramLinkedToast, setTelegramLinkedToast] = useState(false);
  /** 회원 등급: basic(일반) / premium(프리미엄) / family(가족) — 주문 누계 기준으로 계산 */
  const [membershipTier, setMembershipTier] = useState<'basic' | 'premium' | 'family'>(initialMembershipTier);
  const [lastSkinType, setLastSkinType] = useState<string | null>(null);
  const [verifyEmailSending, setVerifyEmailSending] = useState(false);
  const [verifyEmailMessage, setVerifyEmailMessage] = useState<string | null>(null);
  const [verifyEmailError, setVerifyEmailError] = useState<string | null>(null);
  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [telegramLinkError, setTelegramLinkError] = useState<string | null>(null);
  /** 헤더 배지: 사용 가능 멤버십 쿠폰 + 셀피 분석 프로젝트 수 (목록은 /profile/coupons) */
  const [activeCouponCount, setActiveCouponCount] = useState<number | null>(null);
  const [couponCountLoading, setCouponCountLoading] = useState(false);
  const prevTelegramIdRef = useRef<string | null | undefined>(undefined);
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
      const prev = prevTelegramIdRef.current;
      if (prev !== undefined && prev && !nextTelegramId) {
        console.warn('Telegram state changed! (Profile) — was linked, now unlinked. Check DB or network.');
      }
      if (prev !== undefined && !prev && nextTelegramId) {
        setTelegramLinkedToast(true);
        setTimeout(() => setTelegramLinkedToast(false), 3000);
      }
      prevTelegramIdRef.current = nextTelegramId;

      if (data) {
        writeTelegramCache(requestedUserId, !!nextTelegramId);
      } else {
        writeTelegramCache(requestedUserId, false);
      }

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

        if (userId === ADMIN_DUMMY_USER_ID) {
          if (!res.error && res.data) {
            applyRow(res.data);
          } else {
            const r2 = await supabase
              .from('profiles')
              .select('name, grade, points, phone, telegram_id, telegram_reward_given')
              .eq('id', userId)
              .single();
            if (!r2.error) applyRow(r2.data);
          }
          return;
        }

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

  // 마지막 тип кожи (карточка «Тесты»: «Последний: …»)
  useEffect(() => {
    if (!supabase || !userId) {
      setLastSkinType(null);
      return;
    }
    supabase
      .from('skin_test_results')
      .select('skin_type, completed_at')
      .eq('user_id', userId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const sorted = (data as { skin_type: string | null; completed_at: string }[])
            .slice()
            .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
          setLastSkinType(sorted[0].skin_type ?? null);
        } else {
          setLastSkinType(null);
        }
      })
      .catch(() => {
        setLastSkinType(null);
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

  const refreshActiveCouponCount = useCallback(() => {
    if (!supabase || !userId) {
      setActiveCouponCount(null);
      setCouponCountLoading(false);
      return;
    }
    const requestedUserId = userId;
    setCouponCountLoading(true);
    Promise.all([
      supabase
        .from('membership_coupons')
        .select('expires_at, used_at')
        .eq('user_id', requestedUserId),
      supabase.from('selfie_coupon_balances').select('balance').eq('user_id', requestedUserId).maybeSingle(),
    ])
      .then(([mRes, sRes]) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        const now = Date.now();
        const rows = (mRes.data ?? []) as { expires_at: string; used_at: string | null }[];
        const n = rows.filter((c) => !c.used_at && new Date(c.expires_at).getTime() >= now).length;
        let selfie = 0;
        if (!sRes.error && sRes.data != null) {
          const raw = (sRes.data as { balance?: number | null }).balance;
          if (typeof raw === 'number' && !Number.isNaN(raw)) selfie = Math.max(0, raw);
        }
        setActiveCouponCount(n + selfie);
      })
      .catch(() => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setActiveCouponCount(null);
      })
      .finally(() => {
        if (currentUserIdRef.current === requestedUserId) setCouponCountLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    refreshActiveCouponCount();
  }, [refreshActiveCouponCount]);

  // 다른 탭에서 Telegram 연동 후 돌아오면 프로필(연동 여부·포인트) 다시 불러오기
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshProfile();
        refreshActiveCouponCount();
        void refreshEmailConfirmationFromServer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshProfile, refreshActiveCouponCount, refreshEmailConfirmationFromServer]);

  // profiles.email_verified_at 동기화(AuthContext) — JWT/auth만 보면 Confirm OFF 시 오표시
  useEffect(() => {
    if (!userId) return;
    void refreshEmailConfirmationFromServer();
  }, [userId, refreshEmailConfirmationFromServer]);

  /** 프로필에서도 체크아웃과 동일한 매직링크 발송(리다이렉트 → /checkout?ck=…) */
  const handleSendProfileVerifyEmail = useCallback(async () => {
    if (!supabase || !userId || !userEmail?.trim()) {
      setVerifyEmailError(tr('Не удалось определить email. Войдите снова.', 'Could not detect your email. Please sign in again.'));
      return;
    }
    setVerifyEmailSending(true);
    setVerifyEmailMessage(null);
    setVerifyEmailError(null);
    try {
      const result = await resendSignupConfirmationEmail(supabase, userEmail.trim(), '/profile');
      if (!result.ok) {
        setVerifyEmailError(result.message);
        return;
      }
      setVerifyEmailMessage(
        tr('Письмо отправлено. Перейдите по ссылке — после подтверждения обновите страницу.', 'Email sent. Open the link and refresh after confirmation.'),
      );
    } finally {
      setVerifyEmailSending(false);
    }
  }, [userId, userEmail]);

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

  /** 텔레그램 버튼: DB 로드 전에는 sessionStorage 캐시로 즉시 표시(깜빡임 완화), 없으면 스켈레톤 */
  const telegramButtonState = useMemo((): 'linked' | 'unlinked' | 'loading' | null => {
    if (!userId || userId === ADMIN_DUMMY_USER_ID) return null;
    if (dbProfile != null) return dbProfile.telegram_id ? 'linked' : 'unlinked';
    const c = readTelegramCache(userId);
    if (c === true) return 'linked';
    if (c === false) return 'unlinked';
    return 'loading';
  }, [userId, dbProfile]);

  const isVipAdminAccount = !!userEmail && VIP_ADMIN_EMAILS.includes(userEmail.trim().toLowerCase());
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

  const handleStartTelegramLink = useCallback(async () => {
    if (!supabase || !userId) return;
    setTelegramLinkError(null);
    setTelegramLinkLoading(true);
    try {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('link_tokens')
        .insert({ user_id: userId, expires_at: expiresAt })
        .select('token')
        .single();
      if (error || !data?.token) {
        setTelegramLinkError(tr('Не удалось создать ссылку Telegram. Попробуйте ещё раз.', 'Could not create Telegram link. Try again.'));
        return;
      }
      const opened = window.open(`https://t.me/My_SEMO_Beautybot?start=link_${data.token}`, '_blank');
      if (!opened) {
        setTelegramLinkError(tr('Браузер заблокировал переход. Разрешите всплывающее окно и повторите.', 'Popup blocked by browser. Allow popups and try again.'));
        return;
      }
      setTimeout(() => void refreshProfile(), 1200);
    } catch {
      setTelegramLinkError(tr('Не удалось открыть Telegram. Проверьте интернет и повторите.', 'Could not open Telegram. Check internet and try again.'));
    } finally {
      setTelegramLinkLoading(false);
    }
  }, [userId, refreshProfile]);

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

      {/* 연한 하늘색 박스: 웹(인사+우측 3아이콘), 모바일(인사 아래 3아이콘 중앙) */}
      <div className="rounded-xl border border-sky-200/90 bg-sky-50/95 px-3 py-4 shadow-sm ring-1 ring-sky-100/80 sm:px-6 sm:py-6">
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
                className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80 focus:outline-none focus:ring-1 focus:ring-brand"
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
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
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
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
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
            <Link
              to="/profile/coupons"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
              aria-busy={couponCountLoading}
              aria-label={tr('Купоны', 'Coupons')}
            >
              {couponCountLoading ? (
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
              ) : (
                <>
                  <div className="flex h-[18px] w-full shrink-0 items-center justify-center" aria-hidden title={tr('Купоны', 'Coupons')}>
                    <svg className="h-[18px] w-[18px]" viewBox="0 0 30 20" fill="none">
                      <rect x="1.2" y="2" width="27.6" height="16" rx="3" fill="#E8F6FF" stroke="#7CCAF2" strokeWidth="1.2" />
                      <path d="M10.5 2.7v14.6" stroke="#7CCAF2" strokeWidth="1.2" strokeDasharray="2 2" />
                      <path d="M19.6 6.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Zm-4.7 5.3 5.4-7.4" stroke="#2E6F99" strokeWidth="1.2" strokeLinecap="round" />
                      <circle cx="14.3" cy="12.4" r="1.35" stroke="#2E6F99" strokeWidth="1.2" />
                      <circle cx="21.2" cy="14.2" r="1.35" stroke="#2E6F99" strokeWidth="1.2" />
                    </svg>
                  </div>
                  <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                    <span className="text-center text-[10px] font-semibold leading-none tabular-nums text-slate-700">{activeCouponCount ?? 0}</span>
                  </div>
                </>
              )}
            </Link>
          </div>
          {/* 모바일: 인사 아래 가운데 정렬 */}
          <div className="flex shrink-0 flex-row items-center justify-center gap-2 sm:hidden">
            <Link
              to="/profile/tier"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
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
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
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
            <Link
              to="/profile/coupons"
              className="inline-flex h-11 min-h-11 w-20 min-w-20 flex-col items-center justify-center gap-0 rounded-lg border border-sky-200 bg-white/90 px-0 py-1 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
              aria-busy={couponCountLoading}
              aria-label={tr('Купоны', 'Coupons')}
            >
              {couponCountLoading ? (
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
              ) : (
                <>
                  <div className="flex h-[18px] w-full shrink-0 items-center justify-center" aria-hidden title={tr('Купоны', 'Coupons')}>
                    <svg className="h-[18px] w-auto max-w-[28px]" viewBox="0 0 30 20" fill="none">
                      <rect x="1.2" y="2" width="27.6" height="16" rx="3" fill="#E8F6FF" stroke="#7CCAF2" strokeWidth="1.2" />
                      <path d="M10.5 2.7v14.6" stroke="#7CCAF2" strokeWidth="1.2" strokeDasharray="2 2" />
                      <path d="M19.6 6.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Zm-4.7 5.3 5.4-7.4" stroke="#2E6F99" strokeWidth="1.2" strokeLinecap="round" />
                      <circle cx="14.3" cy="12.4" r="1.35" stroke="#2E6F99" strokeWidth="1.2" />
                      <circle cx="21.2" cy="14.2" r="1.35" stroke="#2E6F99" strokeWidth="1.2" />
                    </svg>
                  </div>
                  <div className="mt-1 flex h-[14px] w-full items-end justify-center">
                    <span className="text-center text-[10px] font-semibold leading-none tabular-nums text-slate-700">{activeCouponCount ?? 0}</span>
                  </div>
                </>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* Telegram + E-mail: две колонки (어д민 제외) */}
      {userId && userId !== ADMIN_DUMMY_USER_ID && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-brand/25 bg-brand-soft/95 px-3 pt-3 pb-2 shadow-sm ring-1 ring-brand/10 sm:px-5 sm:pt-5 sm:pb-3">
          {/* 모바일도 2열(텔еграм | 이메일), md 이상은 동일 + 여백만 넓게 */}
          <div className={`${accountLinkTwoColGridClass} md:gap-x-0`}>
            {/* Левая колонка: Telegram — заголовок → кнопка → (미연동 시) пояснение */}
            <div className="flex min-h-0 min-w-0 flex-col border-r border-slate-200/60 pr-2 sm:pr-3 md:pr-5">
              <div className="flex items-center justify-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-[#26A5E4] shadow-sm ring-1 ring-slate-200/80">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                  </svg>
                </span>
                <p className="text-sm font-semibold tracking-tight text-slate-900">Telegram</p>
              </div>
              <div className="mt-2.5">
                {telegramButtonState === 'loading' && (
                  <div
                    className="h-11 w-full animate-pulse rounded-xl bg-slate-200/70"
                    aria-hidden
                  />
                )}
                {telegramButtonState === 'linked' && (
                  <button type="button" disabled className={accountStatusPillClass} aria-label={tr('Telegram привязан', 'Telegram linked')}>
                    {tr('Telegram привязан ✓', 'Telegram linked ✓')}
                  </button>
                )}
                {telegramButtonState === 'unlinked' && (
                  <button
                    type="button"
                    onClick={() => void handleStartTelegramLink()}
                    disabled={telegramLinkLoading}
                    className={accountPrimaryCtaClass}
                  >
                    {telegramLinkLoading ? tr('Открываем…', 'Opening…') : tr('Привязать Telegram', 'Link Telegram')}
                  </button>
                )}
              </div>
              {telegramButtonState === 'unlinked' && (
                <p className={accountCardSubtextClass}>
                  {tr('В Telegram спросим согласие на привязку номера и уведомления о новинках/скидках. Настройки можно изменить позже в профиле.', 'Telegram will ask for consent to link your number and receive updates. You can change this later in profile settings.')}
                </p>
              )}
              {telegramButtonState === 'unlinked' && telegramLinkError && (
                <p className="mt-2 text-xs text-red-600" role="alert">
                  {telegramLinkError}
                </p>
              )}
            </div>

            {/* Правая колонка: E-mail — заголовок → кнопка → (미확인 시) пояснение */}
            <div className="flex min-h-0 min-w-0 flex-col pl-2 sm:pl-3 md:pl-5">
              <div className="flex items-center justify-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/90 text-brand shadow-sm ring-1 ring-brand/25">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                </span>
                <p className="text-sm font-semibold tracking-tight text-slate-900">E-mail</p>
              </div>
              <div className="mt-2.5">
                {!initialized ? (
                  <div className="h-11 w-full animate-pulse rounded-xl bg-slate-200/70" aria-hidden />
                ) : isEmailConfirmed ? (
                  <button type="button" disabled className={accountStatusPillClass} aria-label={tr('Email подтверждён', 'Email verified')}>
                    {tr('Email подтверждён ✓', 'Email verified ✓')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={verifyEmailSending}
                    onClick={() => void handleSendProfileVerifyEmail()}
                    className={accountPrimaryCtaClass}
                  >
                    {verifyEmailSending ? tr('Отправка…', 'Sending…') : tr('Подтвердить email', 'Verify email')}
                  </button>
                )}
              </div>
              {initialized && !isEmailConfirmed && (
                <p className={accountCardSubtextClass}>
                  {tr('Email нужен для подтверждения заказов.', 'Email is required to confirm orders.')}
                </p>
              )}
            </div>
          </div>
          {verifyEmailError && (
            <p className="prose-ru mt-3 border-t border-slate-200/50 pt-3 text-xs text-red-700" role="alert">
              {verifyEmailError}
            </p>
          )}
          {verifyEmailMessage && (
            <p className={`prose-ru text-xs text-slate-600 ${verifyEmailError ? 'mt-1.5' : 'mt-3 border-t border-slate-200/50 pt-3'}`} role="status">
              {verifyEmailMessage}
            </p>
          )}
        </div>
      )}

      {/* 그래픽/아이콘 메뉴: 프로필·테스트·리뷰·주문 (카탈로그는 상단 네비 / SEMO Box에서만) */}
      <nav
        className="mt-5 grid grid-cols-2 gap-2 sm:mt-8 sm:gap-3 xl:grid-cols-4 xl:gap-3"
        aria-label="Profile menu"
      >
        <Link
          to="/profile/edit"
          className="flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10 sm:px-3.5 sm:py-3.5"
        >
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
          to="/profile/test-results"
          className="flex min-h-0 min-w-0 flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-3 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10 sm:px-3.5 sm:py-3.5"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </span>
          <div className="min-w-0 px-0.5">
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base whitespace-nowrap">{tr('Тесты', 'Tests')}</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs whitespace-nowrap">
              {lastSkinType ? (language === 'en' ? `Latest: ${lastSkinType}` : `Последний: ${lastSkinType}`) : tr('Последний: —', 'Latest: —')}
            </p>
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

      {telegramLinkedToast && (
        <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-8" role="status" aria-live="polite">
          {tr('Telegram привязан. Аккаунт успешно связан.', 'Telegram linked. Account connected successfully.')}
        </div>
      )}
    </main>
  );
};
