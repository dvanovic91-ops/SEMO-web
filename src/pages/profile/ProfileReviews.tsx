import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { USE_MOCK_REVIEWS, mockReviews } from '../../data/mocks';

export const ProfileReviews: React.FC = () => {
  const { isLoggedIn, initialized } = useAuth();
  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const list = USE_MOCK_REVIEWS ? mockReviews : [];

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="text-sm text-slate-500 hover:text-slate-700">← Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Мои отзывы
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Оставленные вами отзывы о товарах
        </p>
      </header>

      {list.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">
          Пока нет отзывов. Оформите заказ и оставьте отзыв — вам начислят баллы.
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-4">
              <p className="text-sm font-medium text-slate-800">{r.product}</p>
              <p className="mt-1 text-sm text-slate-600">{r.text}</p>
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span>{r.date}</span>
                <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
