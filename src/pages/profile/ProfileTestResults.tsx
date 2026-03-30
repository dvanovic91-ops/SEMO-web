import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { supabase } from '../../lib/supabase';
import { hasSelfieAnalysisSnapshot } from '../../lib/skinTestSelfie';

/** DB skin_test_results 한 건 */
type TestResultRow = {
  id: string;
  skin_type: string | null;
  completed_at: string;
  selfie_analysis: unknown;
};

export const ProfileTestResults: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
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
      .select('id, skin_type, completed_at, selfie_analysis')
      .eq('user_id', userId)
      .then(({ data }) => {
        const sorted = (
          (data ?? []) as {
            id: string;
            skin_type: string | null;
            completed_at: string;
            selfie_analysis?: unknown;
          }[]
        )
          .slice()
          .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
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
      return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      return iso.slice(0, 10);
    }
  };

  const title = isEn ? 'Test results' : 'Результаты тестов';
  const subtitle = isEn ? 'Latest skin type test results' : 'Последние результаты теста типа кожи';
  const emptyMsg = isEn ? 'No results yet. Take a skin type test first.' : 'Пока нет результатов. Сначала пройдите тест типа кожи.';
  const viewLink = isEn ? 'View test result' : 'Результат теста';
  const badgeSurveyOnly = isEn ? 'Survey only' : 'Только опросник';
  const badgeSurveySelfie = isEn ? 'Survey + selfie' : 'Опросник + селфи';

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> Profile
        </Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>
      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">{emptyMsg}</p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const resultHref =
              r.skin_type && r.skin_type.trim()
                ? `/skin-test?type=${encodeURIComponent(r.skin_type.trim().toUpperCase())}&id=${encodeURIComponent(r.id)}`
                : '/skin-test';
            const hasSelfie = hasSelfieAnalysisSnapshot(r.selfie_analysis);
            return (
              <li key={r.id}>
                <Link
                  to={resultHref}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-white px-4 py-4 transition hover:border-brand/30 hover:bg-brand-soft/10"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{r.skin_type ?? '—'}</p>
                    <p className="text-xs text-slate-500">{formatDate(r.completed_at)}</p>
                    <p className="mt-1.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${
                          hasSelfie
                            ? 'bg-brand-soft/50 text-brand ring-1 ring-brand/25'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {hasSelfie ? badgeSurveySelfie : badgeSurveyOnly}
                      </span>
                    </p>
                  </div>
                  <span className="ml-3 shrink-0 text-xs font-medium text-brand">{viewLink}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
};
