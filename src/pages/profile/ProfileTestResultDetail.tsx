import React, { useEffect, useState, useRef } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { useAuth } from '../../context/AuthContext';
import { SKIN_INFO } from '../../data/skinTestData';
import { supabase } from '../../lib/supabase';

type TestResultRow = {
  id: string;
  skin_type: string | null;
  completed_at: string;
};

/** 테스트 결과 한 건 상세 — 결과지 형태로 표시. 본인 결과만 조회(.eq('user_id', userId))로 권한 보장 */
export const ProfileTestResultDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isLoggedIn, initialized, userId } = useAuth();
  const [result, setResult] = useState<TestResultRow | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef({ id: '', userId: '' });

  useEffect(() => {
    if (!id || !supabase || !userId) {
      setResult(null);
      setLoading(false);
      return;
    }
    requestRef.current = { id, userId };
    setLoading(true);
    supabase
      .from('skin_test_results')
      .select('id, skin_type, completed_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
      .then(({ data, error }) => {
        if (requestRef.current.id !== id || requestRef.current.userId !== userId) return;
        if (error || !data) setResult(null);
        else setResult(data as TestResultRow);
      })
      .catch(() => {
        if (requestRef.current.id !== id || requestRef.current.userId !== userId) return;
        setResult(null);
      })
      .finally(() => {
        if (requestRef.current.id !== id || requestRef.current.userId !== userId) return;
        setLoading(false);
      });
  }, [id, userId]);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return iso.slice(0, 10);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="mb-6">
          <Link to="/profile/test-results" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><BackArrow /> Результаты тестов</Link>
        </p>
        <p className="py-8 text-center text-sm text-slate-500">Загрузка…</p>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="mb-6">
          <Link to="/profile/test-results" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><BackArrow /> Результаты тестов</Link>
        </p>
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">Результат не найден.</p>
      </main>
    );
  }

  const type = result.skin_type ?? '—';
  const info = type !== '—' ? SKIN_INFO[type] : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile/test-results" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"><BackArrow /> Результаты тестов</Link>
      </p>
      <header className="mb-8">
        <p className="text-sm text-slate-500">{formatDate(result.completed_at)}</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Результат теста: {type}
        </h1>
        {info && <p className="mt-1 text-sm text-slate-600">{info.name}</p>}
      </header>
      {info ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
            <p className="text-base leading-relaxed text-slate-700">{info.desc}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">Фокус ухода</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {info.concerns.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-brand/30 bg-brand-soft/30 px-3 py-1 text-sm text-slate-800"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
          {info.avoid && (
            <p className="text-sm text-slate-600">
              <span className="font-medium">Ограничения:</span> {info.avoid}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-6 text-slate-600">Тип кожи: {type}</p>
      )}
    </main>
  );
};
