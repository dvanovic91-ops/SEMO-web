import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

/** 포인트 내역 — 잔액은 DB(profiles.points) 우선, 내역은 향후 API 연동 예정 */
export const ProfilePoints: React.FC = () => {
  const { userEmail, userId, isLoggedIn, initialized } = useAuth();
  const [dbPoints, setDbPoints] = useState<number | null>(null);
  const [profileMeta, setProfileMeta] = useState<{ telegram_reward_given: boolean } | null>(null);
  const [coupons, setCoupons] = useState<
    { id: string; amount: number; expires_at: string; used_at: string | null; tier?: string | null; quarter_label?: string | null }[]
  >([]);
  const [history, setHistory] = useState<{ id: string; label: string; amount: number; date: string }[]>([]);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = userId;

  const refreshPoints = useCallback(() => {
    if (!supabase || !userId) {
      setDbPoints(null);
      setCoupons([]);
      return;
    }
    const requestedUserId = userId;
    supabase
      .from('profiles')
      .select('points, telegram_reward_given')
      .eq('id', requestedUserId)
      .single()
      .then(({ data }) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setDbPoints(data?.points ?? null);
        setProfileMeta({ telegram_reward_given: !!data?.telegram_reward_given });
      })
      .catch(() => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setDbPoints(null);
        setProfileMeta(null);
      });

    supabase
      .from('membership_coupons')
      .select('id, amount, expires_at, used_at, tier, quarter_label')
      .eq('user_id', requestedUserId)
      .order('expires_at', { ascending: true })
      .then(({ data }) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setCoupons(
          (data as { id: string; amount: number; expires_at: string; used_at: string | null; tier?: string | null; quarter_label?: string | null }[]) ??
            [],
        );
      })
      .catch(() => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setCoupons([]);
      });

    Promise.allSettled([
      supabase
        .from('points_ledger')
        .select('id, delta_points, reason, created_at, source_table, source_id')
        .eq('user_id', requestedUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('orders')
        .select('id, created_at, points_used')
        .eq('user_id', requestedUserId)
        .gt('points_used', 0),
    ]).then((res) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        const ledgerOk = res[0].status === 'fulfilled' && !res[0].value.error;
        const ledgerData = ledgerOk ? (res[0].value.data as {
          id: string;
          delta_points: number;
          reason: string;
          created_at: string;
          source_table?: string | null;
          source_id?: string | null;
        }[] | null) : null;
        const ordersData = res[1].status === 'fulfilled'
          ? (res[1].value.data as { id: string; created_at: string; points_used?: number | null }[] | null)
          : null;

        if (ledgerData && ledgerData.length > 0) {
          const rows = ledgerData.map((r) => {
            let label = 'Изменение баллов';
            if (r.reason === 'review_reward_general') label = 'Награда за подробный отзыв';
            else if (r.reason === 'review_reward_special') label = 'Награда за специальный отзыв';
            else if (r.reason === 'order_points_used') label = 'Использование баллов при оплате';
            else if (r.reason === 'skin_test_bonus') label = 'Бонус за прохождение теста кожи';
            else if (r.reason === 'telegram_link_bonus') label = 'Бонус за привязку Telegram';
            return {
              id: `ledger-${r.id}`,
              label,
              amount: Number(r.delta_points ?? 0),
              date: r.created_at,
            };
          });

          // 원장 누락 케이스 보완: 주문 points_used가 있는데 원장에 없는 차감건은 보강 표시
          const deductedOrderIds = new Set(
            ledgerData
              .filter((r) => r.reason === 'order_points_used' && (r.source_id ?? ''))
              .map((r) => String(r.source_id))
          );
          (ordersData ?? []).forEach((o) => {
            const used = Number(o.points_used ?? 0);
            if (used <= 0) return;
            if (deductedOrderIds.has(String(o.id))) return;
            rows.push({
              id: `order-points-fallback-${o.id}`,
              label: 'Использование баллов при оплате',
              amount: -Math.floor(used / 100),
              date: o.created_at,
            });
          });

          setHistory(rows);
          return;
        }

        // points_ledger 미적용/비어있는 환경 fallback
        Promise.allSettled([
          supabase
            .from('product_reviews')
            .select('id, created_at, review_reward_points')
            .eq('user_id', requestedUserId)
            .gt('review_reward_points', 0),
          supabase
            .from('skin_test_results')
            .select('id, completed_at')
            .eq('user_id', requestedUserId),
          supabase
            .from('orders')
            .select('id, created_at, points_used')
            .eq('user_id', requestedUserId)
            .gt('points_used', 0),
        ]).then((results) => {
          if (currentUserIdRef.current !== requestedUserId) return;
          const next: { id: string; label: string; amount: number; date: string }[] = [];

          const reviewRes = results[0].status === 'fulfilled' ? results[0].value.data : null;
          (reviewRes ?? []).forEach((r: { id: string; created_at: string; review_reward_points?: number | null }) => {
            const amount = Number(r.review_reward_points ?? 0);
            if (amount > 0) {
              next.push({
                id: `review-${r.id}`,
                label: amount >= 500 ? 'Награда за специальный отзыв' : 'Награда за подробный отзыв',
                amount,
                date: r.created_at,
              });
            }
          });

          const testRes = results[1].status === 'fulfilled' ? results[1].value.data : null;
          (testRes ?? []).forEach((t: { id: string; completed_at?: string | null }) => {
            next.push({
              id: `skin-test-${t.id}`,
              label: 'Бонус за прохождение теста кожи',
              amount: 300,
              date: t.completed_at ?? '',
            });
          });

          const ordersRes = results[2].status === 'fulfilled' ? results[2].value.data : null;
          (ordersRes ?? []).forEach((o: { id: string; created_at: string; points_used?: number | null }) => {
            const used = Number(o.points_used ?? 0);
            if (used > 0) {
              next.push({
                id: `order-points-${o.id}`,
                label: 'Использование баллов при оплате',
                amount: -Math.floor(used / 100),
                date: o.created_at,
              });
            }
          });

          setHistory(
            next
              .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
              .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i)
          );
        });
      });
  }, [userId]);

  useEffect(() => {
    refreshPoints();
  }, [refreshPoints]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refreshPoints();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [refreshPoints]);

  /** 잔액은 오직 DB(profiles.points) — 조회 전에는 0으로 표시 */
  const points = dbPoints ?? 0;
  const mergedHistory = profileMeta?.telegram_reward_given
    ? [
        ...history,
        { id: 'telegram-reward', label: 'Бонус за привязку Telegram', amount: 200, date: '' },
      ]
    : history;

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          История баллов
        </h1>
        <p className="mt-2 flex items-center gap-2 text-lg text-slate-700">
          <span className="tabular-nums font-medium">{points}</span>
          <span className="text-amber-500">★</span>
          <span className="text-sm font-normal text-slate-500">текущий баланс</span>
        </p>
      </header>

      <ul className="space-y-3">
        {mergedHistory.length === 0 && (
          <p className="text-sm text-slate-500">Пока нет записей.</p>
        )}
        {mergedHistory.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-500">{item.date ? new Date(item.date).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
            </div>
            <span className={item.amount >= 0 ? 'text-brand font-medium' : 'text-slate-500'}>
              {item.amount >= 0 ? '+' : ''}{item.amount} ★
            </span>
          </li>
        ))}
      </ul>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-slate-900">Купоны по уровню участника</h2>
        {coupons.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Пока нет купонов.</p>
        ) : (
          <ul className="mt-3 space-y-3">
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
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-slate-800">
                      Купон {c.amount} ₽ {c.tier ? `(${c.tier})` : ''}
                    </p>
                    <p className="text-xs text-slate-500">{c.quarter_label ?? ''}</p>
                  </div>
                  <span
                    className={
                      isUsed ? 'text-slate-400 text-xs' : isExpired ? 'text-slate-400 text-xs' : 'text-emerald-600 text-xs font-medium'
                    }
                  >
                    {statusText}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
};
