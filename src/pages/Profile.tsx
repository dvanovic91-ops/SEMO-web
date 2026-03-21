import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ADMIN_DUMMY_USER_ID } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { resendSignupConfirmationEmail } from '../lib/authSignupResend';
import {
  accountLinkTwoColGridClass,
  accountPrimaryCtaClass,
  accountStatusPillClass,
} from '../lib/accountLinkUi';

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

/** 멤버십 쿠폰 — membership_coupons (ProfilePoints와 동일 필드) */
type ProfileCoupon = {
  id: string;
  amount: number;
  expires_at: string;
  used_at: string | null;
  tier?: string | null;
  quarter_label?: string | null;
};

/**
 * 로그인된 사용자 개인화면 — 인사/등급/포인트 박스.
 * 이름·등급(표시)·포인트의 유일한 근거는 Supabase `profiles`(및 주문 기반 membershipTier) — 브라우저에 이름/포인트를 캐시하지 않음.
 * Telegram 연동 여부만 세션 스토리지로 깜빡임 완화(0/1 플래그, 개인정보 아님).
 */
export const Profile: React.FC = () => {
  const navigate = useNavigate();
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
  const [gradeTooltipOpen, setGradeTooltipOpen] = useState(false);
  const [dbProfile, setDbProfile] = useState<{ name: string | null; grade: string; points: number; telegram_id: string | null } | null>(null);
  /** 연동 성공 시 토스트 (다른 탭에서 연동 후 돌아왔을 때) */
  const [telegramLinkedToast, setTelegramLinkedToast] = useState(false);
  /** 회원 등급: basic(일반) / premium(프리미엄) / family(가족) — 주문 누계 기준으로 계산 */
  const [membershipTier, setMembershipTier] = useState<'basic' | 'premium' | 'family'>('basic');
  const [lastSkinType, setLastSkinType] = useState<string | null>(null);
  const [verifyEmailSending, setVerifyEmailSending] = useState(false);
  const [verifyEmailMessage, setVerifyEmailMessage] = useState<string | null>(null);
  const [verifyEmailError, setVerifyEmailError] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<ProfileCoupon[]>([]);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
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

      setDbProfile(
        data
          ? {
              name: data.name ?? '',
              grade: data.grade ?? 'Обычный участник',
              points: data.points ?? 0,
              telegram_id: nextTelegramId,
            }
          : null,
      );
    };

    return (async () => {
      try {
        const res = await supabase
          .from('profiles')
          .select('name, grade, points, telegram_id, telegram_reward_given')
          .eq('id', userId)
          .single();

        if (userId === ADMIN_DUMMY_USER_ID) {
          if (!res.error && res.data) {
            applyRow(res.data);
          } else {
            const r2 = await supabase
              .from('profiles')
              .select('name, grade, points, telegram_id, telegram_reward_given')
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
        if (sumRub >= 100_000) {
          setMembershipTier('family');
        } else if (sumRub >= 35_000) {
          setMembershipTier('premium');
        } else {
          setMembershipTier('basic');
        }
      })
      .catch(() => {
        setMembershipTier('basic');
      });
  }, [userId]);

  const refreshCoupons = useCallback(() => {
    if (!supabase || !userId) {
      setCoupons([]);
      setCouponsLoading(false);
      return;
    }
    const requestedUserId = userId;
    setCouponsLoading(true);
    supabase
      .from('membership_coupons')
      .select('id, amount, expires_at, used_at, tier, quarter_label')
      .eq('user_id', requestedUserId)
      .order('expires_at', { ascending: true })
      .then(({ data }) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setCoupons((data as ProfileCoupon[]) ?? []);
      })
      .catch(() => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setCoupons([]);
      })
      .finally(() => {
        if (currentUserIdRef.current === requestedUserId) setCouponsLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    refreshCoupons();
  }, [refreshCoupons]);

  // 다른 탭에서 Telegram 연동 후 돌아오면 프로필(연동 여부·포인트) 다시 불러오기
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshProfile();
        refreshCoupons();
        void refreshEmailConfirmationFromServer();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshProfile, refreshCoupons, refreshEmailConfirmationFromServer]);

  // profiles.email_verified_at 동기화(AuthContext) — JWT/auth만 보면 Confirm OFF 시 오표시
  useEffect(() => {
    if (!userId) return;
    void refreshEmailConfirmationFromServer();
  }, [userId, refreshEmailConfirmationFromServer]);

  /** 프로필에서도 체크아웃과 동일한 매직링크 발송(리다이렉트 → /checkout?ck=…) */
  const handleSendProfileVerifyEmail = useCallback(async () => {
    if (!supabase || !userId || !userEmail?.trim()) {
      setVerifyEmailError('Не удалось определить email. Войдите снова.');
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
        'Письмо отправлено. Перейдите по ссылке — после подтверждения обновите страницу.',
      );
    } finally {
      setVerifyEmailSending(false);
    }
  }, [userId, userEmail]);

  /** 표시용 이름: DB(profiles.name)만 — 로드 전에는 이메일 @ 앞부분만 플레이스홀더 */
  const displayName =
    (dbProfile?.name && String(dbProfile.name).trim()) ||
    (userEmail ? userEmail.split('@')[0] : 'SEMO клиент');
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

  // 누적 결제액 기준 등급 표시·툴팁 텍스트 — 조기 return 위에 두어 훅 순서 고정 (Rules of Hooks)
  const gradeLabel = useMemo(() => {
    if (membershipTier === 'family') return 'Семейный участник';
    if (membershipTier === 'premium') return 'Премиум участник';
    return 'Обычный участник';
  }, [membershipTier]);

  /** 사용 가능한 쿠폰 수(만료·사용 제외) — 버튼 배지용 */
  const activeCouponCount = useMemo(() => {
    const now = Date.now();
    return coupons.filter((c) => {
      if (c.used_at) return false;
      return new Date(c.expires_at).getTime() >= now;
    }).length;
  }, [coupons]);

  // 모달 열릴 때 목록 새로고침
  useEffect(() => {
    if (couponModalOpen) refreshCoupons();
  }, [couponModalOpen, refreshCoupons]);

  // 모달: Esc로 닫기 + 스크롤 잠금
  useEffect(() => {
    if (!couponModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCouponModalOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [couponModalOpen]);

  if (!initialized) return null;
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
    <main className="mx-auto w-full max-w-2xl px-3 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6 sm:gap-4">
        <h1 className="min-w-0 text-lg font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Личный кабинет
        </h1>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isAdmin && (
            <Link
              to="/admin"
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
            Выйти
          </button>
        </div>
      </header>

      {/* 연한 하늘색 박스: 인사(위) → 아래 한 줄 [등급 왼쪽 | 포인트·쿠폰 오른쪽] */}
      <div className="rounded-xl border border-sky-200/90 bg-sky-50/95 px-3 py-4 shadow-sm ring-1 ring-sky-100/80 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3">
          <p className="break-words text-center text-base font-medium text-slate-800 sm:text-left sm:text-lg">
            Здравствуйте, {displayName}!
          </p>
          <div className="flex min-w-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div
              className="relative min-w-0"
              onMouseEnter={() => setGradeTooltipOpen(true)}
              onMouseLeave={() => setGradeTooltipOpen(false)}
            >
              <div className="inline-flex items-center gap-1 text-sm text-sky-800">
                <span>{gradeLabel}</span>
                <span
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-sky-300/80 bg-sky-100/80 text-[10px] text-sky-700"
                  aria-label="Информация о статусе участника"
                  aria-describedby={gradeTooltipOpen ? 'grade-tooltip' : undefined}
                >
                  i
                </span>
              </div>
              {gradeTooltipOpen && (
                <div
                  id="grade-tooltip"
                  className="absolute left-0 top-full z-10 mt-1 max-w-[min(100vw-1.5rem,18rem)] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-snug text-slate-700 shadow-lg sm:max-w-none sm:whitespace-nowrap"
                  role="tooltip"
                >
                  <p className="break-words sm:whitespace-nowrap">• Обычный: 100 баллов каждый квартал (3 месяца действия).</p>
                  <p className="mt-1 break-words sm:whitespace-nowrap">• Премиум: от 35 000 ₽ подтверждённых заказов, 200 баллов/квартал.</p>
                  <p className="mt-1 break-words sm:whitespace-nowrap">• Семейный: от 100 000 ₽ подтверждённых заказов, 300 баллов/квартал.</p>
                </div>
              )}
            </div>
            {/* 포인트·쿠폰: 등급과 같은 행 오른쪽 */}
            <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-2">
              <Link
                to="/profile/points"
                className="inline-flex h-11 min-h-11 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white/90 px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
                aria-busy={!pointsLoaded}
              >
                {pointsLoaded ? (
                  <>
                    <span className="tabular-nums">{displayPoints}</span>
                    <span className="text-amber-500" aria-hidden>
                      ★
                    </span>
                  </>
                ) : (
                  <span
                    className="inline-block h-5 min-w-[3rem] animate-pulse rounded bg-slate-200/90"
                    aria-label="Загрузка баллов"
                  />
                )}
              </Link>
              <button
                type="button"
                onClick={() => setCouponModalOpen(true)}
                className="inline-flex h-11 min-h-11 items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-white/90 px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-sky-100/80"
                aria-busy={couponsLoading}
                aria-label="Купоны"
                aria-haspopup="dialog"
                aria-expanded={couponModalOpen}
              >
                {couponsLoading ? (
                  <span
                    className="inline-block h-5 min-w-[3rem] animate-pulse rounded bg-slate-200/90"
                    aria-label="Загрузка купонов"
                  />
                ) : (
                  <>
                    <span className="font-semibold tabular-nums">{activeCouponCount}</span>
                    <span className="text-sky-600" aria-hidden title="Купоны">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2 9a2 2 0 012-2h16a2 2 0 012 2v1a2 2 0 010 4v1a2 2 0 01-2 2H4a2 2 0 01-2-2v-1a2 2 0 010-4V9z"
                        />
                      </svg>
                    </span>
                  </>
                )}
              </button>
            </div>
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
                  <button type="button" disabled className={accountStatusPillClass} aria-label="Telegram привязан">
                    Telegram привязан ✓
                  </button>
                )}
                {telegramButtonState === 'unlinked' && (
                  <Link
                    to="/profile/edit?focus=phone"
                    className={accountPrimaryCtaClass}
                  >
                    Привязать Telegram
                  </Link>
                )}
              </div>
              {telegramButtonState === 'unlinked' && (
                <p className="prose-ru mx-auto mt-3 max-w-[19rem] text-center text-[10px] leading-tight text-[#6B7280] sm:max-w-none sm:text-[11px] sm:leading-snug">
                  <span className="block sm:inline">Привяжите Telegram </span>
                  <span className="mt-0.5 block sm:mt-0 sm:inline">и получите 200 баллов.</span>
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
                  <button type="button" disabled className={accountStatusPillClass} aria-label="Email подтверждён">
                    Email подтверждён ✓
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={verifyEmailSending}
                    onClick={() => void handleSendProfileVerifyEmail()}
                    className={accountPrimaryCtaClass}
                  >
                    {verifyEmailSending ? 'Отправка…' : 'Подтвердить email'}
                  </button>
                )}
              </div>
              {initialized && !isEmailConfirmed && (
                <p className="prose-ru mx-auto mt-3 max-w-[19rem] text-center text-[10px] leading-snug text-[#6B7280] sm:max-w-[20rem] sm:text-[11px] sm:leading-snug">
                  Email нужен для подтверждения заказов.
                  <br />
                  Без подтверждения покупка заблокирована.
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

      {/* 그래픽/아이콘 메뉴: 컴팩트 카드, xl에서 4열로 넓은 화면에서 가로 여유 */}
      <nav
        className="mt-8 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4 xl:gap-4"
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
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base md:whitespace-nowrap">Профиль</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs">Личные данные</p>
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
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base md:whitespace-nowrap">Тесты</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs">
              {lastSkinType ? `Последний: ${lastSkinType}` : 'Последний: —'}
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
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base md:whitespace-nowrap">Отзывы</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs">Мои отзывы о товарах</p>
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
            <p className="text-center text-sm font-semibold text-slate-800 sm:text-base md:whitespace-nowrap">Заказы</p>
            <p className="prose-ru mt-0.5 text-center text-[10px] text-slate-500 sm:text-xs">История и статус</p>
          </div>
        </Link>
      </nav>

      {couponModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setCouponModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="coupon-modal-title"
            className="flex max-h-[min(88vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <h2 id="coupon-modal-title" className="text-base font-semibold text-slate-900">
                Мои купоны
              </h2>
              <button
                type="button"
                onClick={() => setCouponModalOpen(false)}
                className="flex h-10 min-w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">
              {couponsLoading ? (
                <div className="space-y-3" aria-busy>
                  <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                </div>
              ) : coupons.length === 0 ? (
                <p className="text-sm text-slate-500">Пока нет купонов.</p>
              ) : (
                <ul className="space-y-3">
                  {coupons.map((c) => {
                    const now = new Date();
                    const expires = new Date(c.expires_at);
                    const isUsed = !!c.used_at;
                    const isExpired = !isUsed && expires.getTime() < now.getTime();
                    const statusText = isUsed
                      ? 'Использован'
                      : isExpired
                        ? 'Истёк'
                        : `Действует до ${expires.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-sm sm:px-4"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">
                            Купон {c.amount} ₽ {c.tier ? `(${c.tier})` : ''}
                          </p>
                          <p className="text-xs text-slate-500">{c.quarter_label ?? ''}</p>
                        </div>
                        <span
                          className={
                            isUsed || isExpired
                              ? 'shrink-0 text-xs text-slate-400'
                              : 'shrink-0 text-xs font-medium text-emerald-600'
                          }
                        >
                          {statusText}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="shrink-0 border-t border-slate-100 px-4 py-3 sm:px-5">
              <Link
                to="/profile/points"
                onClick={() => setCouponModalOpen(false)}
                className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 text-center text-sm font-medium text-slate-700 transition hover:border-brand/40 hover:bg-brand-soft/20"
              >
                Баллы и купоны — подробнее
              </Link>
            </div>
          </div>
        </div>
      )}

      {telegramLinkedToast && (
        <div className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-white shadow-lg md:bottom-8" role="status" aria-live="polite">
          Telegram привязан. Аккаунт успешно связан.
        </div>
      )}
    </main>
  );
};
