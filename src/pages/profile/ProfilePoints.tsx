import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProfile } from '../../lib/profileStorage';
import { supabase } from '../../lib/supabase';
import { USE_MOCK_POINTS, mockPointBalance, mockPointHistory } from '../../data/mocks';

/** 포인트 내역 — 잔액은 프로필과 동일 소스(DB 우선), 내역은 목업 또는 향후 API */
export const ProfilePoints: React.FC = () => {
  const { userEmail, userId, isLoggedIn, initialized } = useAuth();
  const [dbPoints, setDbPoints] = useState<number | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = userId;

  const refreshPoints = useCallback(() => {
    if (!supabase || !userId) {
      setDbPoints(null);
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
  const points = dbPoints !== null ? dbPoints : (USE_MOCK_POINTS ? mockPointBalance : (localProfile?.points ?? 0));
  const history = USE_MOCK_POINTS ? mockPointHistory : [];

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">← Profile</Link>
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
        {history.length === 0 && !USE_MOCK_POINTS && (
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
    </main>
  );
};
