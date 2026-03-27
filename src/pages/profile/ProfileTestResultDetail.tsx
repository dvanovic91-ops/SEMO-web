import React, { useEffect, useState, useRef } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { AuthInitializingScreen, SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { supabase } from '../../lib/supabase';

type TestResultRow = {
  id: string;
  skin_type: string | null;
  completed_at: string;
};

/** 예전 URL(/profile/test-results/:id) 진입 시 — 본인 결과 로드 후 제품 매칭 화면(/skin-test)으로만 이동 */
export const ProfileTestResultDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isLoggedIn, initialized, userId } = useAuth();
  const { language } = useI18n();
  const isEn = language === 'en';
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

  if (!initialized) return <AuthInitializingScreen />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="mb-6">
          <Link to="/profile/test-results" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
            <BackArrow /> {isEn ? 'Test results' : 'Результаты тестов'}
          </Link>
        </p>
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      </main>
    );
  }

  if (!result) {
    return (
      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <p className="mb-6">
          <Link to="/profile/test-results" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
            <BackArrow /> {isEn ? 'Test results' : 'Результаты тестов'}
          </Link>
        </p>
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">
          {isEn ? 'Result not found.' : 'Результат не найден.'}
        </p>
      </main>
    );
  }

  const t = result.skin_type?.trim();
  const to = t ? `/skin-test?type=${encodeURIComponent(t.toUpperCase())}` : '/skin-test';
  return <Navigate to={to} replace />;
};
