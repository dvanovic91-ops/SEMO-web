import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  QUESTIONS,
  ANSWERS,
  SCORE_MAP,
  PROFILE_STEPS,
  SKIN_INFO,
  calcSkinType,
  type SkinTypeInfo,
} from '../data/skinTestData';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

const MAX_TEST_COUNT = 2;
/** 어드민 이메일 — 웹에서도 테스트 횟수 제한 없음 (봇 ADMIN_IDS와 별도) */
const ADMIN_EMAILS = ['admin@semo-beautybox.com'];
/** 테스트 횟수 제한 없음 (해당 이메일만) */
const UNLIMITED_TEST_EMAILS = ['dvanovic91@gmail.com'];

type Stage = 'intro' | 'profile' | 'test' | 'result';

/** 프로필 다음 단계 */
function nextProfileStep(step: number): number {
  return step + 1;
}

export const SkinTest: React.FC = () => {
  const { userId, userEmail } = useAuth();
  const isAdmin = !!userEmail && ADMIN_EMAILS.includes(userEmail);
  const noTestLimit = !!userEmail && UNLIMITED_TEST_EMAILS.includes(userEmail);
  const [stage, setStage] = useState<Stage>('intro');
  const [testCount, setTestCount] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [profileStep, setProfileStep] = useState(0);
  const [profileData, setProfileData] = useState<Record<string, string>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<{
    type: string;
    info: SkinTypeInfo;
    scores: Record<1 | 2 | 3 | 4, number>;
  } | null>(null);

  /** 회원 기준 skin_test_results 건수 조회 (2회 제한용) */
  useEffect(() => {
    if (!supabase || !userId) {
      setTestCount(null);
      setLimitReached(false);
      return;
    }
    supabase
      .from('skin_test_results')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count }) => {
        const n = count ?? 0;
        setTestCount(n);
        setLimitReached(!noTestLimit && n >= MAX_TEST_COUNT);
      })
      .catch(() => setTestCount(0));
  }, [userId, noTestLimit]);

  const handleAgree = () => {
    if (!isAdmin && !noTestLimit && limitReached) return;
    setStage('profile');
    setProfileStep(0);
  };

  const handleProfileSelect = (key: string, value: string) => {
    const next = { ...profileData, [key]: value };
    setProfileData(next);
    if (profileStep + 1 >= PROFILE_STEPS.length) {
      setStage('test');
      setQuestionIndex(0);
      setAnswers([]);
    } else {
      setProfileStep(nextProfileStep(profileStep));
    }
  };

  const handleProfilePrev = () => {
    if (profileStep === 0) {
      setStage('intro');
      return;
    }
    setProfileStep(profileStep - 1);
  };

  const isLastQuestion = questionIndex + 1 >= QUESTIONS.length;

  const handleAnswer = (valueKey: string) => {
    const raw = SCORE_MAP[valueKey];
    const q = QUESTIONS[questionIndex];
    const score = q.reversed ? -raw : raw;

    if (isLastQuestion && answers.length === QUESTIONS.length) {
      const lastScore = answers[answers.length - 1];
      if (score === lastScore) {
        setAnswers(answers.slice(0, -1));
        return;
      }
      setAnswers([...answers.slice(0, -1), score]);
      return;
    }

    setAnswers([...answers, score]);
    if (!isLastQuestion) setQuestionIndex(questionIndex + 1);
  };

  const handlePrev = () => {
    if (questionIndex <= 0) return;
    setQuestionIndex(questionIndex - 1);
    setAnswers(answers.slice(0, -1));
  };

  const handleBackToProfile = () => {
    setStage('profile');
    setProfileStep(0);
  };

  const handleFinalSubmit = () => {
    if (answers.length !== QUESTIONS.length) return;
    const { type, scores } = calcSkinType(answers);
    const info = SKIN_INFO[type];
    if (info) setResult({ type, info, scores });
    if (userId) {
      if (!isAdmin && (limitReached || (testCount !== null && testCount >= MAX_TEST_COUNT))) return;
      if (supabase) {
        supabase.from('skin_test_results').insert({ user_id: userId, skin_type: type }).then(() => {
          setTestCount((c) => {
            const next = c === null ? 1 : c + 1;
            if (next >= MAX_TEST_COUNT) setLimitReached(true);
            return next;
          });
        });
      }
    } else {
      // 비회원: 로컬에만 저장, 가입 시 AuthContext에서 DB 저장
      try {
        localStorage.setItem('semo_anon_result', JSON.stringify({ skin_type: type }));
        localStorage.setItem('semo_anon_test_done', '1');
      } catch {
        // ignore
      }
    }
    setStage('result');
  };

  // ─── 인트로: 비회원 1회 허용, 2회째부터 가입 유도. 회원 2회 제한 ───
  const anonAlreadyUsed =
    typeof window !== 'undefined' && !userId && localStorage.getItem('semo_anon_test_done') === '1';

  if (stage === 'intro') {
    if (anonAlreadyUsed) {
      return (
        <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-6 sm:min-h-screen sm:py-16 md:py-24">
          <div className="mx-auto w-full max-w-4xl px-1 text-center">
            <p className="text-center text-sm leading-snug text-slate-600 sm:text-base md:text-lg">
              Тест можно пройти один раз без регистрации. Зарегистрируйтесь — результат сохранится и вы сможете пройти тест ещё раз.
            </p>
            <p className="mt-4 text-center text-base font-semibold text-brand sm:text-lg">
              Зарегистрируйтесь! Всего 10 секунд!
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/login"
                className="w-full max-w-xs rounded-full bg-brand py-3.5 text-center text-sm font-medium text-white transition hover:bg-brand/90 sm:py-4"
              >
                Зарегистрироваться! Всего 10 секунд!
              </Link>
              <Link to="/" className="text-xs text-slate-400 hover:text-slate-600 sm:text-sm">
                ← На главную
              </Link>
            </div>
          </div>
        </main>
      );
    }
    if (userId && limitReached && !isAdmin) {
      return (
        <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-6 sm:min-h-screen sm:py-16 md:py-24">
          <div className="mx-auto w-full max-w-4xl px-1 text-center">
            <p className="text-center text-sm leading-snug text-slate-600 sm:text-base md:text-lg">
              Тест можно пройти не более 2 раз. Ваши результаты — в разделе «Профиль».
            </p>
            <div className="mt-8 flex flex-col items-center gap-3">
              <Link
                to="/profile"
                className="w-full max-w-xs rounded-full bg-brand py-3.5 text-center text-sm font-medium text-white transition hover:bg-brand/90 sm:py-4"
              >
                В профиль
              </Link>
              <Link to="/" className="text-xs text-slate-400 hover:text-slate-600 sm:text-sm">
                ← На главную
              </Link>
            </div>
          </div>
        </main>
      );
    }
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-4 py-6 sm:min-h-screen sm:py-16 md:py-24">
        <div className="mx-auto w-full max-w-4xl px-1 text-center">
          <p className="text-center text-sm leading-snug text-slate-600 break-words sm:text-base sm:leading-relaxed md:text-lg">
            «Даже дорогой уход бесполезен, если он не подходит вашей коже.
          </p>
          <p className="mt-2 text-center text-sm leading-snug text-slate-600 break-words sm:mt-3 sm:text-base sm:leading-relaxed md:text-lg">
            Пройдите тест, чтобы не тратить лишнего и получить экспертный план ухода!»
          </p>
          <p className="mt-3 text-center text-xs text-slate-400 break-words sm:mt-6 sm:text-sm">
            Это ваш экспертный гид для ежедневного ухода.
          </p>
          <p className="mt-1 text-center text-xs text-slate-400 break-words sm:mt-2 sm:text-sm">
            Для диагностики специфических заболеваний рекомендуем дополнить тест консультацией врача.
          </p>
          <div className="mt-6 flex flex-col items-center gap-2 sm:mt-12 sm:gap-4">
            <button
              type="button"
              onClick={handleAgree}
              className="w-full max-w-xs rounded-full border border-brand bg-white py-3 text-sm font-medium text-brand transition hover:bg-brand hover:text-white sm:py-3.5 md:py-4"
            >
              Согласна и начать / Согласен и начать
            </button>
            <Link
              to="/"
              className="text-xs text-slate-400 hover:text-slate-600 sm:text-sm"
            >
              ← На главную
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ─── 프로필: 본 테스트와 동일 레이아웃(가운데·같은 위치·같은 간격) ───
  if (stage === 'profile') {
    const step = PROFILE_STEPS[profileStep];
    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-20 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            Несколько вопросов перед тестом
          </p>
          <p className="text-sm font-light leading-snug tracking-wide text-slate-800 sm:text-base sm:leading-relaxed">
            {step.label}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2.5 sm:mt-8 sm:gap-3">
            {step.options.map(([label, value]) => (
              <button
                key={`p${profileStep}-${value}`}
                type="button"
                onClick={() => handleProfileSelect(step.key, value)}
                className="touch-no-hover w-full max-w-xl rounded-xl border border-slate-200 bg-white py-2.5 px-4 text-left text-sm text-slate-800 transition active:bg-slate-50 sm:py-3 sm:px-5 md:hover:border-brand md:hover:bg-brand-soft/20"
              >
                {label}
              </button>
            ))}
            {profileStep > 0 && (
              <button
                type="button"
                onClick={handleProfilePrev}
                className="mt-3 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700 sm:mt-4"
              >
                <span aria-hidden>←</span>
                Предыдущий шаг
              </button>
            )}
          </div>
          <p className="mt-4 tabular-nums text-sm text-slate-500 sm:mt-5">
            {profileStep + 1}/{PROFILE_STEPS.length}
          </p>
        </div>
      </main>
    );
  }

  // ─── 테스트: 볼드 소제목, 괄호 숫자 제거·1/20은 답 밑, 간격 확대 ───
  if (stage === 'test') {
    const q = QUESTIONS[questionIndex];
    const current = questionIndex + 1;
    const total = QUESTIONS.length;

    return (
      <main className="flex flex-col bg-white px-4 py-4 pb-24 sm:py-6 md:pb-0 md:py-12 md:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col text-center">
          {/* 소제목: 주황·볼드, 괄호 숫자 없음 */}
          <p className="mb-6 text-sm font-semibold tracking-wide text-brand sm:mb-7 sm:text-base">
            Тест типа кожи SEMO
          </p>

          {/* 질문 — 소제목과 간격 넓힘 */}
          <p className="text-sm font-light leading-snug tracking-wide text-slate-800 sm:text-base sm:leading-relaxed">
            {q.text}
          </p>
          {/* 답 항목 — 질문과 간격 넓힘 */}
          <div className="mt-6 flex flex-col items-center gap-2.5 sm:mt-8 sm:gap-3">
            {(() => {
              const showSelection = isLastQuestion && answers.length === QUESTIONS.length;
              const currentScore = showSelection ? answers[answers.length - 1] : undefined;
              const selectedKey =
                currentScore !== undefined
                  ? ANSWERS.find(([, vk]) => (q.reversed ? -SCORE_MAP[vk] : SCORE_MAP[vk]) === currentScore)?.[1] ?? null
                  : null;
              return ANSWERS.map(([label, valueKey]) => (
                <button
                  key={`q${questionIndex}-${valueKey}`}
                  type="button"
                  onClick={() => handleAnswer(valueKey)}
                  className={`w-full max-w-xl rounded-xl border py-3 px-4 text-left text-sm font-normal tracking-wide transition sm:py-3.5 sm:px-5 ${
                    showSelection && valueKey === selectedKey
                      ? 'border-brand bg-brand-soft/20 text-brand'
                      : 'touch-no-hover border-slate-200 bg-white text-slate-700 active:bg-slate-50 md:hover:border-brand md:hover:bg-brand-soft/10 md:hover:text-brand'
                  }`}
                >
                  {label}
                </button>
              ));
            })()}
            {isLastQuestion && answers.length === QUESTIONS.length && (
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="mt-4 w-full max-w-xl rounded-full bg-brand py-3 text-sm font-semibold text-white hover:bg-brand/90 sm:mt-5 sm:py-3.5"
              >
                Завершить тест
              </button>
            )}
            {/* 1/20 — 답 항목 밑 */}
            <p className="mt-4 tabular-nums text-sm text-slate-500 sm:mt-5">
              {current}/{total}
            </p>
            <button
              type="button"
              onClick={handlePrev}
              className="mt-2 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700 disabled:invisible sm:mt-3"
              disabled={questionIndex === 0}
            >
              <span aria-hidden>←</span>
              Предыдущий вопрос
            </button>
            <button
              type="button"
              onClick={handleBackToProfile}
              className="mt-1 flex items-center justify-center gap-1 text-sm text-slate-500 hover:text-slate-700 sm:mt-2"
            >
              <span aria-hidden>↩</span>
              Несколько вопросов перед тестом
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ─── 결과: SKIN_INFO 기반 럭셔리 결과 화면 (화이트 & 오렌지) ───
  if (stage === 'result' && result) {
    const { type, info, scores } = result;
    return (
      <main className="min-h-screen bg-white px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-4xl">
          {/* 상단 타입 뱃지 — 회색 bar 없음 (다른 페이지 소제목과 높이 맞춤) */}
          <div>
            <p className="text-sm font-medium tracking-wide text-brand">
              Результат теста
            </p>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
              Ваш тип кожи: {type}
            </h1>
            <p className="mt-2 text-sm text-slate-500">{info.name}</p>
          </div>

          {/* 설명 — 이모지 제거 */}
          <div className="mt-10 py-6">
            <p className="text-base leading-relaxed text-slate-700 sm:text-lg">
              {info.desc.replace(/\s*[\u2728\u{1F31F}\u{1F338}\u{1F4AB}\u{1F3C6}\u{1F33F}]+\s*$/gu, '').trim()}
            </p>
          </div>

          {/* Баллы — Фокус ухода 위, 결과/포쿠스보다 작은 폰트·진한 회색 */}
          <p className="mt-6 text-sm text-slate-600">
            Баллы: Увл. {scores[1] >= 0 ? `+${scores[1]}` : scores[1]} · Чувств. {scores[2] >= 0 ? `+${scores[2]}` : scores[2]} · Пигм. {scores[3] >= 0 ? `+${scores[3]}` : scores[3]} · Возраст. {scores[4] >= 0 ? `+${scores[4]}` : scores[4]}
          </p>

          {/* Фокус ухода */}
          <div className="mt-6">
            <p className="text-sm font-medium tracking-wide text-slate-600">
              Фокус ухода
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {info.concerns.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-brand/30 bg-brand-soft/30 px-4 py-1.5 text-sm text-slate-800"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Персональный выбор SEMO — 뷰티박스 이미지 (호버 시 6분할, 각각 다른 이미지) */}
          <div className="mt-8 rounded-xl border border-brand/20 bg-brand-soft/25 py-6 px-6">
            <p className="text-sm font-medium tracking-wide text-brand">
              Персональный выбор SEMO
            </p>
            <div className="mt-4 flex justify-center">
              <div className="group relative aspect-[3/2] w-full max-w-md overflow-hidden rounded-xl bg-slate-100">
                <img
                  src="https://placehold.co/600x400/fef0eb/E65427?text=Beauty+Box1"
                  alt="Beauty Box"
                  className="h-full w-full object-cover transition group-hover:opacity-0"
                />
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-2 opacity-0 transition group-hover:opacity-100">
                  {[
                    'https://placehold.co/400x300/fef0eb/E65427?text=1',
                    'https://placehold.co/400x300/fef0eb/E65427?text=2',
                    'https://placehold.co/400x300/fef0eb/E65427?text=3',
                    'https://placehold.co/400x300/fef0eb/E65427?text=4',
                    'https://placehold.co/400x300/fef0eb/E65427?text=5',
                    'https://placehold.co/400x300/fef0eb/E65427?text=6',
                  ].map((src, i) => (
                    <div key={i} className="overflow-hidden">
                      <img
                        src={src}
                        alt={`${i + 1}`}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* CTA: 비회원은 가입 유도(결과 저장 + 1회 더), 회원은 기존 */}
          <div className="mt-12 flex flex-col gap-4">
            {!userId ? (
              <>
                <p className="text-center text-sm text-slate-600">
                  Сохраните результат в личном кабинете и пройдите тест ещё раз после регистрации.
                </p>
                <Link
                  to="/login"
                  className="rounded-full bg-brand py-4 text-center text-base font-semibold text-white transition hover:bg-brand/90"
                >
                  Зарегистрироваться! Всего 10 секунд!
                </Link>
              </>
            ) : (
              <Link
                to="/profile"
                className="rounded-full bg-brand py-4 text-center text-base font-semibold text-white transition hover:bg-brand/90"
              >
                В профиль
              </Link>
            )}
            <Link
              to="/"
              className="text-center text-sm text-slate-500 hover:text-slate-700"
            >
              На главную
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return null;
};
