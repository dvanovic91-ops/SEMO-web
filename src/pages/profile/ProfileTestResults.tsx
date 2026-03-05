import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

/** DB skin_test_results 한 건 */
type TestResultRow = {
  id: string;
  skin_type: string | null;
  completed_at: string;
};

export const ProfileTestResults: React.FC = () => {
  const { isLoggedIn, initialized, userId } = useAuth();
  const [list, setList] = useState<TestResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !userId) {
      setList([]);
      setLoading(false);
      return;
    }
    supabase
      .from('skin_test_results')
      .select('id, skin_type, completed_at')
      .eq('user_id', userId)
      .then(({ data }) => {
        const sorted = ((data ?? []) as { id: string; skin_type: string | null; completed_at: string }[]).slice().sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
        setList(sorted as TestResultRow[]);
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return iso.slice(0, 10);
    }
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Результаты тестов
        </h1>
        <p className="mt-1 text-sm text-slate-500">Последние результаты теста типа кожи</p>
      </header>
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">
          Пока нет результатов. Пройдите тест типа кожи.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-4">
              <Link to={`/profile/test-results/${r.id}`} className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">{r.skin_type ?? '—'}</p>
                <p className="text-xs text-slate-500">{formatDate(r.completed_at)}</p>
              </Link>
              <Link
                to={r.skin_type ? `/recommendations/${encodeURIComponent(r.skin_type.trim().toUpperCase())}` : '/recommendations'}
                className="ml-3 shrink-0 text-xs font-medium text-brand hover:underline"
              >
                Рекомендуемые товары
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
