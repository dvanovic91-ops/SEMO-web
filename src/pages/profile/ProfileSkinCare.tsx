import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../../components/SemoPageSpinner';
import { SkinResultMetricsCharts, type SelfieMetricsInput } from '../../components/SkinResultMetricsCharts';
import { useAuth } from '../../context/AuthContext';
import { useI18n } from '../../context/I18nContext';
import { approximateScoresFromSkinTypeCode } from '../../data/skinTestData';
import { supabase } from '../../lib/supabase';
import { formatSkinTypeShort } from '../../lib/skinTypeDisplay';
import { hasSelfieAnalysisSnapshot, selfieAnalysisToClientState } from '../../lib/skinTestSelfie';
import { buildSkinStateSummaryParagraph } from '../../lib/skinTestStateSummary';

type SkinCareResultRow = {
  id: string;
  skin_type: string | null;
  completed_at: string;
  baumann_scores: unknown;
  selfie_analysis: unknown;
  concern_text?: string | null;
};

type RiskCard = {
  title: string;
  value: string;
  description: string;
  tone: 'brand' | 'amber' | 'sky';
};

const EMPTY_SCORES: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

function parseBaumannScores(raw: unknown, skinType: string | null): Record<1 | 2 | 3 | 4, number> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      value = null;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const read = (key: '1' | '2' | '3' | '4') => {
      const n = Number(obj[key]);
      return Number.isFinite(n) ? n : 0;
    };
    return { 1: read('1'), 2: read('2'), 3: read('3'), 4: read('4') };
  }
  return skinType ? approximateScoresFromSkinTypeCode(skinType) : EMPTY_SCORES;
}

function normalizeSelfieMetrics(raw: unknown): SelfieMetricsInput | null {
  const state = selfieAnalysisToClientState(raw);
  if (!state) return null;
  const metrics = state.skin_metrics;
  const read = (key: keyof SelfieMetricsInput) => {
    const n = Number(metrics[key]);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined;
  };
  return {
    redness_index: read('redness_index'),
    pigment_unevenness: read('pigment_unevenness'),
    texture_roughness: read('texture_roughness'),
    oiliness_index: read('oiliness_index'),
    blemishes_index: read('blemishes_index'),
    dullness_index: read('dullness_index'),
    fine_lines_index: read('fine_lines_index'),
  };
}

function scoreBand(value: number, isEn: boolean) {
  const abs = Math.abs(value);
  if (abs >= 4) return isEn ? 'High' : 'Высокий';
  if (abs >= 2) return isEn ? 'Medium' : 'Средний';
  return isEn ? 'Low' : 'Низкий';
}

function buildRiskCards(
  scores: Record<1 | 2 | 3 | 4, number>,
  selfie: SelfieMetricsInput | null,
  latest: SkinCareResultRow,
  isEn: boolean,
): RiskCard[] {
  const sensitivityScore = Math.max(scores[2], 0);
  const redness = Number(selfie?.redness_index ?? 0);
  // S/R 축 점수에서 직접 도출 (Q6 화장품 따끔, Q7 향료 반응이 S/R에 포함됨)
  const irritationFlag = scores[2] >= 4;
  const fragranceFlag = scores[2] >= 2;
  const sensitivityValue = Math.max(sensitivityScore * 10 + redness * 0.5 + (irritationFlag ? 18 : 0) + (fragranceFlag ? 12 : 0), 0);

  const pigmentScore = Math.max(scores[3], 0);
  const pigmentPhoto = Number(selfie?.pigment_unevenness ?? 0);
  const pigmentValue = Math.max(pigmentScore * 12 + pigmentPhoto * 0.55, 0);

  const oilDryRaw = scores[1];
  const oilPhoto = Number(selfie?.oiliness_index ?? 0);
  const balanceLabel =
    oilDryRaw > 1.5
      ? isEn
        ? 'Dry-leaning'
        : 'Склонность к сухости'
      : oilDryRaw < -1.5 || oilPhoto > 62
        ? isEn
          ? 'Oil-leaning'
          : 'Склонность к жирности'
        : isEn
          ? 'Balanced'
          : 'Ближе к балансу';

  return [
    {
      title: isEn ? 'Irritation risk' : 'Риск раздражения',
      value: scoreBand(sensitivityValue / 10, isEn),
      description: isEn
        ? 'Based on sensitivity answers, recent irritation, fragrance sensitivity, and selfie redness.'
        : 'По чувствительности, недавним реакциям, отдушкам и покраснению на селфи.',
      tone: 'brand',
    },
    {
      title: isEn ? 'Tone / pigment risk' : 'Тон / пигментация',
      value: scoreBand(pigmentValue / 10, isEn),
      description: isEn
        ? 'Shows whether tone unevenness should be treated as a priority.'
        : 'Показывает, стоит ли ставить неровный тон в приоритет.',
      tone: 'amber',
    },
    {
      title: isEn ? 'Oil / dry balance' : 'Баланс жирности и сухости',
      value: balanceLabel,
      description: isEn
        ? 'Combines the questionnaire axis with the photo T-zone gloss signal.'
        : 'Совмещает ось опросника и блеск T-зоны на фото.',
      tone: 'sky',
    },
  ];
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

function sortLatestFirst(rows: SkinCareResultRow[]) {
  return rows
    .slice()
    .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());
}

export const ProfileSkinCare: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const { initialized, isLoggedIn, userId } = useAuth();
  const [list, setList] = useState<SkinCareResultRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase || !userId) {
      setList([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void (async () => {
      const client = supabase;
      try {
        const full = await client
          .from('skin_test_results')
          .select('id, skin_type, completed_at, baumann_scores, selfie_analysis, concern_text')
          .eq('user_id', userId);

        if (!full.error) {
          setList(sortLatestFirst((full.data ?? []) as SkinCareResultRow[]));
          return;
        }

        // Some deployed databases may not have the newest risk columns yet.
        const basic = await client
          .from('skin_test_results')
          .select('id, skin_type, completed_at, baumann_scores, selfie_analysis, concern_text')
          .eq('user_id', userId);
        setList(basic.error ? [] : sortLatestFirst((basic.data ?? []) as SkinCareResultRow[]));
      } catch {
        setList([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const latest = list[0] ?? null;
  const scores = useMemo(
    () => (latest ? parseBaumannScores(latest.baumann_scores, latest.skin_type) : EMPTY_SCORES),
    [latest],
  );
  const selfieMetrics = useMemo(() => (latest ? normalizeSelfieMetrics(latest.selfie_analysis) : null), [latest]);
  const hasSelfie = latest ? hasSelfieAnalysisSnapshot(latest.selfie_analysis) : false;
  const riskCards = useMemo(
    () => (latest ? buildRiskCards(scores, selfieMetrics, latest, isEn) : []),
    [latest, scores, selfieMetrics, isEn],
  );
  const summary = latest
    ? buildSkinStateSummaryParagraph(scores, selfieMetrics, isEn, latest.concern_text ?? undefined)
    : '';
  const latestSkinTypeLabel = formatSkinTypeShort(latest?.skin_type, isEn);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  const latestHref =
    latest?.skin_type
      ? `/skin-test?type=${encodeURIComponent(latest.skin_type.trim().toUpperCase())}&id=${encodeURIComponent(latest.id)}`
      : '/skin-test';

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          <BackArrow /> {isEn ? 'Profile' : 'Профиль'}
        </Link>
      </p>

      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {isEn ? 'Current skin profile' : 'Текущий профиль кожи'}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {isEn
            ? 'A simple dashboard from your latest skin test and selfie analysis. Trend graphs will be added after repeated measurements.'
            : 'Простая панель по последнему тесту и селфи-анализу. Графики изменений появятся после повторных измерений.'}
        </p>
      </header>

      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : !latest ? (
        <section className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-10 text-center">
          <p className="text-sm font-medium text-slate-800">
            {isEn ? 'No skin profile yet.' : 'Профиль кожи пока не создан.'}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {isEn ? 'Take the skin test first to see your dashboard.' : 'Сначала пройдите тест кожи, чтобы увидеть панель.'}
          </p>
          <Link
            to="/skin-test"
            className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
          >
            {isEn ? 'Start skin test' : 'Пройти тест'}
          </Link>
        </section>
      ) : (
        <div className="space-y-5">
          <section className="rounded-2xl border border-brand/20 bg-brand-soft/55 p-5 shadow-sm sm:p-7">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand">{isEn ? 'Latest result' : 'Последний результат'}</p>
              {latest.skin_type ? (
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand/80 ring-1 ring-brand/15">
                  {latest.skin_type}
                </span>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">{latestSkinTypeLabel}</h2>
              {!hasSelfie ? (
                <Link
                  to={latestHref}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand/90"
                >
                  {isEn ? 'Add selfie' : 'Добавить селфи'}
                </Link>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {formatDate(latest.completed_at)} · {hasSelfie ? (isEn ? 'Survey + selfie' : 'Опрос + селфи') : (isEn ? 'Survey only' : 'Только опрос')}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {riskCards.map((card) => {
              const toneClass =
                card.tone === 'amber'
                  ? 'border-amber-100 bg-amber-50/70 text-amber-700'
                  : card.tone === 'sky'
                    ? 'border-sky-100 bg-sky-50/70 text-sky-700'
                    : 'border-brand/15 bg-brand-soft/45 text-brand';
              return (
                <article key={card.title} className={`rounded-2xl border p-4 ${toneClass}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{card.title}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{card.value}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{card.description}</p>
                </article>
              );
            })}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-base font-semibold text-slate-900">{isEn ? 'Care direction' : 'Направление ухода'}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{summary}</p>
          </section>

          <SkinResultMetricsCharts
            scores={scores}
            skinMetrics={selfieMetrics}
            isEn={isEn}
            concernFreeText={latest.concern_text ?? undefined}
          />

          <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900">{isEn ? 'Recent history' : 'Последние результаты'}</h2>
              <Link to="/profile/test-results" className="text-xs font-semibold text-brand hover:opacity-90">
                {isEn ? 'View all' : 'Все результаты'}
              </Link>
            </div>
            <ul className="mt-4 divide-y divide-slate-100">
              {list.slice(0, 3).map((row) => {
                const href =
                  row.skin_type
                    ? `/skin-test?type=${encodeURIComponent(row.skin_type.trim().toUpperCase())}&id=${encodeURIComponent(row.id)}`
                    : '/skin-test';
                const rowHasSelfie = hasSelfieAnalysisSnapshot(row.selfie_analysis);
                return (
                  <li key={row.id}>
                    <Link to={href} className="flex items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{formatSkinTypeShort(row.skin_type, isEn)}</p>
                        <p className="text-xs text-slate-500">{formatDate(row.completed_at)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${rowHasSelfie ? 'bg-brand-soft/60 text-brand' : 'bg-slate-100 text-slate-500'}`}>
                        {rowHasSelfie ? (isEn ? 'Selfie done' : 'Селфи есть') : (isEn ? 'Survey only' : 'Только опрос')}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
};
