import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const MOCK_RESULTS = [
  { id: '1', type: 'Комбинированная', date: '2026-02-28' },
  { id: '2', type: 'Нормальная', date: '2026-01-15' },
];

export const ProfileTestResults: React.FC = () => {
  const { isLoggedIn, initialized } = useAuth();
  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">← Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Результаты тестов
        </h1>
        <p className="mt-1 text-sm text-slate-500">Последние результаты теста типа кожи</p>
      </header>
      <ul className="space-y-3">
        {MOCK_RESULTS.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-4">
            <div>
              <p className="font-medium text-slate-800">{r.type}</p>
              <p className="text-xs text-slate-500">{r.date}</p>
            </div>
            <Link to="/skin-test" className="text-sm font-medium text-brand hover:underline">Пройти снова</Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-center">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">← Profile</Link>
      </p>
    </main>
  );
};
