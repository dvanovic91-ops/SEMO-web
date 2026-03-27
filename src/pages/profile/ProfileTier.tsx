import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { AuthInitializingScreen, SemoPageSpinner } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** 관리자 2계정은 등급을 VIP로 고정 표시 */
const VIP_ADMIN_EMAILS = ['dvanovic91@gmail.com', 'admin@semo-box.ru'];

/** 회원 등급 안내 + 확정 주문 누계 금액(배송완료/구매확정, 테스트 주문 제외) */
export const ProfileTier: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { userId, userEmail, isLoggedIn, initialized, isAdmin } = useAuth();
  const targetUserId = useMemo(() => {
    const p = searchParams.get('userId');
    if (isAdmin && p && UUID_RE.test(p)) return p;
    return userId ?? null;
  }, [searchParams, isAdmin, userId]);

  const [loading, setLoading] = useState(true);
  const [sumRub, setSumRub] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = targetUserId;

  const refresh = useCallback(() => {
    if (!supabase || !targetUserId) {
      setLoading(false);
      setSumRub(0);
      setOrderCount(0);
      return;
    }
    const requested = targetUserId;
    setLoading(true);
    supabase
      .from('orders')
      .select('total_cents, status, is_test')
      .eq('user_id', requested)
      .in('status', ['delivered', 'confirmed'])
      .then(({ data }) => {
        if (currentUserIdRef.current !== requested) return;
        const rows = (data ?? []) as { total_cents?: number | null; is_test?: boolean | null }[];
        const valid = rows.filter((r) => !r.is_test);
        const cents = valid.reduce((acc, r) => acc + (r.total_cents ?? 0), 0);
        setOrderCount(valid.length);
        setSumRub(cents / 100);
      })
      .catch(() => {
        if (currentUserIdRef.current !== requested) return;
        setOrderCount(0);
        setSumRub(0);
      })
      .finally(() => {
        if (currentUserIdRef.current === requested) setLoading(false);
      });
  }, [targetUserId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refresh]);

  if (!initialized) return <AuthInitializingScreen />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const viewingOtherUser = isAdmin && targetUserId && userId && targetUserId !== userId;
  const isVipAdminAccount =
    !viewingOtherUser && !!userEmail && VIP_ADMIN_EMAILS.includes(userEmail.trim().toLowerCase());
  const tier: 'bronze' | 'silver' | 'gold' = sumRub >= 100_000 ? 'gold' : sumRub >= 35_000 ? 'silver' : 'bronze';
  const nextTarget = isVipAdminAccount ? null : tier === 'bronze' ? 35_000 : tier === 'silver' ? 100_000 : null;
  const tierLabel = isVipAdminAccount ? 'VIP' : tier === 'gold' ? 'Gold' : tier === 'silver' ? 'Silver' : 'Bronze';

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> Profile
        </Link>
      </p>
      {viewingOtherUser && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="status">
          Viewing selected user tier (admin).
        </p>
      )}

      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">Membership tier</h1>
        <p className="mt-2 text-sm text-slate-500">Calculated only from confirmed and delivered orders.</p>
      </header>

      <section className="rounded-xl border border-sky-200 bg-sky-50/80 p-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <SemoPageSpinner showLabel={false} />
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">Current tier</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {tierLabel}
            </p>
            <p className="mt-3 text-sm text-slate-600">Confirmed purchase total</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {sumRub.toLocaleString('en-US', { maximumFractionDigits: 0 })} ₽
            </p>
            <p className="mt-1 text-xs text-slate-500">Eligible orders: {orderCount}</p>
            {nextTarget != null && (
              <p className="mt-3 text-xs text-slate-600">
                To next tier: {(nextTarget - sumRub).toLocaleString('en-US', { maximumFractionDigits: 0 })} ₽
              </p>
            )}
          </>
        )}
      </section>

      {!isVipAdminAccount && (
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-900">Tier thresholds</h2>
        <ul className="mt-3 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0" title="Бронзовый уровень" aria-label="Бронзовый уровень">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                <defs>
                  <linearGradient id="tier-bronze-metal" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#F2C189" />
                    <stop offset="0.45" stopColor="#C07A3A" />
                    <stop offset="1" stopColor="#7A3E10" />
                  </linearGradient>
                </defs>
                <path d="M12 3L22 20H2L12 3Z" fill="url(#tier-bronze-metal)" />
              </svg>
            </span>
            <span>
              <span className="bg-gradient-to-r from-amber-700 via-orange-700 to-amber-900 bg-clip-text font-semibold text-transparent">
                Bronze
              </span>
              : up to 34,999 ₽ in confirmed orders
              <span className="mt-0.5 block text-xs text-slate-500">Benefit: 100 ₽ coupon every quarter.</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0" title="Серебряный уровень" aria-label="Серебряный уровень">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                <defs>
                  <linearGradient id="tier-silver-metal" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#F1F5F9" />
                    <stop offset="0.45" stopColor="#A8B4C3" />
                    <stop offset="1" stopColor="#667487" />
                  </linearGradient>
                </defs>
                <path d="M12 3L22 20H2L12 3Z" fill="url(#tier-silver-metal)" />
              </svg>
            </span>
            <span>
              <span className="bg-gradient-to-r from-slate-400 via-slate-500 to-slate-700 bg-clip-text font-semibold text-transparent">
                Silver
              </span>
              : from 35,000 ₽ to 99,999 ₽ in confirmed orders
              <span className="mt-0.5 block text-xs text-slate-500">Benefit: 200 ₽ coupon every quarter.</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 inline-flex shrink-0" title="Золотой уровень" aria-label="Золотой уровень">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                <defs>
                  <linearGradient id="tier-gold-metal" x1="2" y1="3" x2="22" y2="20" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#FFF4BF" />
                    <stop offset="0.45" stopColor="#F1C94B" />
                    <stop offset="1" stopColor="#B88509" />
                  </linearGradient>
                </defs>
                <path d="M12 3L22 20H2L12 3Z" fill="url(#tier-gold-metal)" />
              </svg>
            </span>
            <span>
              <span className="bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-700 bg-clip-text font-semibold text-transparent">
                Gold
              </span>
              : from 100,000 ₽ in confirmed orders
              <span className="mt-0.5 block text-xs text-slate-500">Benefit: 300 ₽ coupon every quarter.</span>
            </span>
          </li>
        </ul>
      </section>
      )}
    </main>
  );
};
