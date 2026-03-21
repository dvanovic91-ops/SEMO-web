import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * 스크롤 시 뷰포트에 들어오면 보이도록 하는 훅.
 * rootMargin으로 "조금 전에" 노출시켜 자연스럽게 등장시킴.
 */
function useInView(option?: { rootMargin?: string; threshold?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const { rootMargin = '0px 0px -80px 0px', threshold = 0.1 } = option ?? {};

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsInView(true);
      },
      { rootMargin, threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { ref, isInView };
}

/** 3단계 시각 블록 — 미니멀 아이콘 */
const HOW_STEPS = [
  {
    id: 1,
    title: 'Узнать свой тип кожи',
    sub: 'Тест по 4 параметрам\nувлажнённость, чувствительность, пигментация, возрастные изменения.',
    icon: (
      <svg className="h-14 w-14 sm:h-16 sm:w-16" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="32" cy="26" r="10" />
        <path d="M22 44c0-5.5 4.5-10 10-10s10 4.5 10 10" />
      </svg>
    ),
  },
  {
    id: 2,
    title: 'Бокс по типу кожи',
    sub: 'Рекомендованный бокс под ваш тип — только корейская уходовая косметика.',
    icon: (
      <svg className="h-14 w-14 sm:h-16 sm:w-16" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="14" y="20" width="36" height="28" rx="1.5" />
        <path d="M14 28h36" />
        <circle cx="32" cy="34" r="5" />
      </svg>
    ),
  },
  {
    id: 3,
    title: 'Доставка от Кореи до двери',
    sub: 'Door-to-door доставка до дома, обновление бокса по сезонам.',
    icon: (
      <svg className="h-14 w-14 sm:h-16 sm:w-16" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 22l24 18 24-18" />
        <path d="M8 42l24 18 24-18" />
        <circle cx="32" cy="32" r="3" fill="currentColor" />
      </svg>
    ),
  },
];

/** 단일 스텝 블록 — 스크롤 시 등장 */
function HowStep({
  step,
  isVisible,
}: {
  step: (typeof HOW_STEPS)[0];
  isVisible: boolean;
}) {
  return (
    <div
      className={`flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4 py-16 transition-all duration-700 ease-out sm:gap-8 sm:py-24 ${
        isVisible ? 'translate-y-0 opacity-100' : 'translate-y-12 opacity-0'
      }`}
    >
      <span className="text-6xl font-light tabular-nums text-brand sm:text-7xl">{step.id}</span>
      <div className="text-slate-400">{step.icon}</div>
      {/* 웹에서 설명 문장 한 줄 유지: sm~에서 폭 확대 (max-w-xl → 2xl/3xl) */}
      <div className="max-w-xl min-w-0 px-1 text-center sm:max-w-2xl md:max-w-3xl">
        <h2 className="prose-ru text-lg font-semibold text-slate-900 sm:text-2xl">{step.title}</h2>
        <p className="prose-ru mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600 sm:text-base">{step.sub}</p>
      </div>
    </div>
  );
}

export const Home: React.FC = () => {
  const step1 = useInView({ rootMargin: '0px 0px -100px 0px', threshold: 0.15 });
  const step2 = useInView({ rootMargin: '0px 0px -100px 0px', threshold: 0.15 });
  const step3 = useInView({ rootMargin: '0px 0px -100px 0px', threshold: 0.15 });

  return (
    <>
      {/* 상단 여백 후, 중앙 블록: 메인 타이틀 + CTA */}
      <main className="flex min-h-[75vh] flex-col items-center justify-center px-3 py-12 sm:px-4 sm:py-24">
        <section className="mx-auto w-full min-w-0 max-w-4xl px-0 text-center">
          <h1 className="prose-ru text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-2xl md:text-4xl">
            Узнайте свой тип кожи — персональный корейский бьюти-бокс ждёт вас!
          </h1>
          <p className="prose-ru mt-5 text-sm leading-relaxed text-slate-600 sm:mt-7 sm:text-base md:text-lg">
            <span className="block">Пройдите тест, и мы подберём корейскую премиальную косметику под ваш профиль.</span>
            <span className="mt-2 block">Доставка в Россию раз в квартал или полгода.</span>
          </p>
          <div className="mx-auto mt-10 flex w-full max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:justify-center">
            <Link
              to="/skin-test"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 sm:w-auto sm:py-2.5"
            >
              Узнать тип кожи
            </Link>
            <Link
              to="/shop"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand sm:w-auto sm:py-2.5"
            >
              Сезонные наборы
            </Link>
          </div>
        </section>

        {/* 스크롤 유도: 역삼각형 오렌지 반짝임, 커서 없음 */}
        <div className="mt-16 flex flex-col items-center gap-3 sm:mt-20">
          <p className="text-sm font-medium tracking-wide text-slate-500">
            Как это работает
          </p>
          <p className="text-sm text-slate-500">Прокрутите вниз</p>
          <span className="animate-shine text-brand" aria-hidden style={{ fontSize: '1.25rem' }}>
            ▼
          </span>
        </div>
      </main>

      {/* Как это работает — 스크롤 시 단계별 등장 (상단 구분선·회색 바 없음) */}
      <section className="bg-white">
        <div className="mx-auto max-w-5xl">

          <div ref={step1.ref}>
            <HowStep step={HOW_STEPS[0]} isVisible={step1.isInView} />
          </div>
          <div ref={step2.ref}>
            <HowStep step={HOW_STEPS[1]} isVisible={step2.isInView} />
          </div>
          <div ref={step3.ref}>
            <HowStep step={HOW_STEPS[2]} isVisible={step3.isInView} />
          </div>
        </div>
      </section>
    </>
  );
};
