import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, ADMIN_DUMMY_USER_ID } from '../context/AuthContext';
import { getProfile } from '../lib/profileStorage';
import { supabase } from '../lib/supabase';
import { BackArrow } from '../components/BackArrow';

/**
 * 로그인된 사용자 개인화면 — 인사/등급/포인트 박스. Supabase 로그인 시 DB 포인트(테스트 완료 300p 등 이벤트별) 표시.
 * 텔레그램 연동: fetch 실패 시 기존 상태 유지, localStorage는 성공 응답에서만 갱신.
 */
export const Profile: React.FC = () => {
  const navigate = useNavigate();
  const { userEmail, userId, setUserEmail, isLoggedIn, initialized, isAdmin } = useAuth();
  const [gradeTooltipOpen, setGradeTooltipOpen] = useState(false);
  const [dbProfile, setDbProfile] = useState<{ name: string | null; grade: string; points: number; telegram_id: string | null } | null>(null);
  const prevTelegramIdRef = useRef<string | null | undefined>(undefined);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = userId;

  const localProfile = useMemo(() => (userEmail ? getProfile(userEmail) : null), [userEmail]);

  const refreshProfile = useCallback(() => {
    if (!supabase || !userId) {
      setDbProfile(null);
      return;
    }
    const requestedUserId = userId;
    supabase
      .from('profiles')
      .select('name, grade, points, telegram_id, telegram_reward_given')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        const nextTelegramId = data?.telegram_id ?? null;
        const prev = prevTelegramIdRef.current;
        if (prev !== undefined && prev && !nextTelegramId) {
          console.warn('Telegram state changed! (Profile) — was linked, now unlinked. Check DB or network.');
        }
        prevTelegramIdRef.current = nextTelegramId;

        setDbProfile(
          data
            ? {
                name: data.name ?? '',
                grade: data.grade ?? 'Обычный участник',
                points: data.points ?? 0,
                telegram_id: nextTelegramId,
              }
            : null
        );
        try {
          localStorage.setItem('telegram_linked', nextTelegramId ? '1' : '0');
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // fetch 실패 시 기존 값 유지 — DB에 연동돼 있어도 네트워크 오류로 풀린 것처럼 보이지 않도록
        // setDbProfile(null); localStorage.removeItem 제거
      });
  }, [userId]);

  useEffect(() => {
    setDbProfile(null);
    refreshProfile();
  }, [refreshProfile]);

  // 다른 탭에서 Telegram 연동 후 돌아오면 프로필(연동 여부·포인트) 다시 불러오기
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshProfile();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshProfile]);

  const profile = dbProfile ?? localProfile;

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

  const gradeTooltipText = 'Обычный участник, Премиум участник';

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Личный кабинет
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {isAdmin && (
            <Link
              to="/admin"
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Админ
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Выйти
          </button>
        </div>
      </header>

      {/* 옅은 주황 박스: 인사 + 등급(툴팁) + 포인트(별) */}
      <div className="rounded-xl border border-brand/20 bg-brand-soft/30 px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-medium text-slate-800 sm:text-lg">
              Здравствуйте, {profile?.name || (userEmail ? userEmail.split('@')[0] : 'SEMO клиент')}!
            </p>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => setGradeTooltipOpen((v) => !v)}
                onBlur={() => setGradeTooltipOpen(false)}
                className="text-sm text-brand hover:underline"
                title={gradeTooltipText}
              >
                {profile?.grade ?? 'Обычный участник'}, подписка SEMO 2026!
              </button>
              {gradeTooltipOpen && (
                <div
                  className="absolute left-0 top-full z-10 mt-1 max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-lg"
                  role="tooltip"
                >
                  {gradeTooltipText}
                </div>
              )}
            </div>
          </div>
          <Link
            to="/profile/points"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-brand/30 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-brand-soft/20"
          >
            <span className="tabular-nums">{profile?.points ?? 0}</span>
            <span className="text-amber-500" aria-hidden>
              ★
            </span>
          </Link>
        </div>
      </div>

      {/* Telegram 연동: 한 줄 — 왼쪽 제목·설명, 오른쪽 연결 버튼만 (테스트 어드민은 미표시) */}
      {userId && userId !== ADMIN_DUMMY_USER_ID && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[#0088cc]">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                </svg>
              </span>
              <p className="text-sm font-medium text-slate-800">Telegram‑бот</p>
            </div>
            {dbProfile?.telegram_id ? (
              <p className="mt-1 text-xs text-slate-600">
                Аккаунт привязан. Заказы, баллы и рекомендации доступны и в боте.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-600">
                Чтобы привязать Telegram, подтвердите номер в профиле. За привязку 200 баллов.
              </p>
            )}
          </div>
          <div className="shrink-0">
            {!dbProfile?.telegram_id && (
              <Link
                to="/profile/edit?focus=phone"
                className="inline-block rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Привязать
              </Link>
            )}
          </div>
        </div>
      )}

      {/* 그래픽/아이콘 메뉴: 프로필 수정, 테스트 결과, 리뷰, 주문 내역 — 한 줄 4개, 아이콘 위·텍스트 아래 */}
      <nav className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Profile menu">
        <Link
          to="/profile/edit"
          className="flex h-full flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">Редактировать профиль</p>
            <p className="mt-1 text-xs text-slate-500">Пароль и персональные данные</p>
          </div>
        </Link>

        <Link
          to="/profile/test-results"
          className="flex h-full flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">Результаты тестов</p>
            <p className="mt-1 text-xs text-slate-500">Последние результаты типа кожи</p>
          </div>
        </Link>

        <Link
          to="/profile/reviews"
          className="flex h-full flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">Мои отзывы</p>
            <p className="mt-1 text-xs text-slate-500">Оставленные отзывы</p>
          </div>
        </Link>

        <Link
          to="/profile/orders"
          className="flex h-full flex-col items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-center shadow-sm transition hover:border-brand/40 hover:bg-brand-soft/10"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-medium text-slate-800">История заказов</p>
            <p className="mt-1 text-xs text-slate-500">Заказы и отслеживание доставки</p>
          </div>
        </Link>
      </nav>

      <p className="mt-6 text-center">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> На главную
        </Link>
      </p>
    </main>
  );
};
