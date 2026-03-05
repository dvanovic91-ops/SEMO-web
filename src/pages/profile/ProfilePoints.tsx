import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { useAuth } from '../../context/AuthContext';
import { getProfile } from '../../lib/profileStorage';
import { supabase } from '../../lib/supabase';

/** 포인트 내역 — 잔액은 DB(profiles.points) 우선, 내역은 향후 API 연동 예정 */
export const ProfilePoints: React.FC = () => {
  const { userEmail, userId, isLoggedIn, initialized } = useAuth();
  const [dbPoints, setDbPoints] = useState<number | null>(null);
  const [coupons, setCoupons] = useState<
    { id: string; amount: number; expires_at: string; used_at: string | null; tier?: string | null; quarter_label?: string | null }[]
  >([]);
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
      .select('points')
      .eq('id', requestedUserId)
      .single()
      .then(({ data }) => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setDbPoints(data?.points ?? null);
      })
      .catch(() => {
        if (currentUserIdRef.current !== requestedUserId) return;
        setDbPoints(null);
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

  const localProfile = userEmail ? getProfile(userEmail) : null;
  const points = dbPoints !== null ? dbPoints : (localProfile?.points ?? 0);
  const history: { id: string; label: string; amount: number; date: string }[] = [];

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
        {history.length === 0 && (
          <p className="text-sm text-slate-500">Пока нет записей.</p>
        )}
        {history.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium text-slate-800">{item.label}</p>
              <p className="text-xs text-slate-500">{item.date}</p>
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
