import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getProfile } from '../../lib/profileStorage';

/** 포인트 내역 — 쌓인 포인트 히스토리 (향후 API 연동) */
export const ProfilePoints: React.FC = () => {
  const { userEmail, isLoggedIn, initialized } = useAuth();
  const profile = userEmail ? getProfile(userEmail) : null;

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const points = profile?.points ?? 0;
  const history = [
    { id: '1', label: 'Регистрация', amount: 100, date: '2026-01-15' },
    { id: '2', label: 'Тест типа кожи', amount: 50, date: '2026-02-01' },
    { id: '3', label: 'Заказ #1001', amount: -200, date: '2026-02-10' },
    { id: '4', label: 'Бонус', amount: 550, date: '2026-02-12' },
  ];

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

      <p className="mt-8 text-center">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">← Profile</Link>
      </p>
    </main>
  );
};
