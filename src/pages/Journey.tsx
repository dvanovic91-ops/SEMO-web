import React from 'react';
import { Link } from 'react-router-dom';
import { JourneyStepImage } from '../components/JourneyStepImage';
import { useI18n } from '../context/I18nContext';
import { JOURNEY_INTRO_SUBLINE_CLASS, JOURNEY_STEPS } from '../data/journeySteps';

/**
 * Journey to SEMO — 4 steps, alternating image/text.
 * Each step: title + body only (no separate subtitle).
 */
export const Journey: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-12 overflow-x-auto text-center [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
          Journey to SEMO
        </h1>
        <p className={JOURNEY_INTRO_SUBLINE_CLASS}>
          {isEn
            ? 'From AI Skin Testing to Direct Korea Delivery—Complete Your Skincare in 4 Easy Steps.'
            : 'От AI-теста кожи до прямой доставки из Кореи — идеальный уход в 4 простых шага.'}
        </p>
      </header>

      <section className="space-y-24 md:space-y-32">
        {JOURNEY_STEPS.map((step, index) => {
          const isImageLeft = index % 2 === 0;
          const stepNum = index + 1;
          const titleText = isEn ? step.title.en : step.title.ru;
          return (
            <article
              key={step.title.en}
              className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12 lg:gap-16"
            >
              <div
                className={`overflow-hidden rounded-2xl bg-slate-100 ${isImageLeft ? '' : 'md:order-2'}`}
              >
                {step.imageUrl ? (
                  <JourneyStepImage src={step.imageUrl} alt={titleText} />
                ) : (
                  <div className="flex min-h-[280px] w-full items-center justify-center bg-gradient-to-br from-brand-soft/30 to-slate-100 sm:min-h-[360px] md:min-h-[420px] lg:min-h-[460px]">
                    <span className="text-4xl font-semibold text-slate-300 sm:text-5xl md:text-6xl">
                      {step.imagePlaceholder}
                    </span>
                  </div>
                )}
              </div>

              <div
                className={`flex min-w-0 flex-col justify-center ${isImageLeft ? '' : 'md:order-1'}`}
              >
                <span className="text-sm font-semibold tracking-wide text-brand">Step {stepNum}</span>
                <h2
                  className={`mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl ${
                    step.titleSingleLineMd
                      ? 'md:whitespace-nowrap md:text-base lg:text-xl xl:text-2xl 2xl:text-3xl'
                      : ''
                  }`}
                >
                  {titleText}
                </h2>
                <p className="prose-ru mt-4 text-base leading-relaxed text-slate-600 sm:mt-5 sm:text-lg">
                  {isEn ? step.description.en : step.description.ru}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      <div className="mx-auto mt-20 flex w-full max-w-xl flex-col gap-3 pb-12 sm:flex-row sm:gap-4">
        <Link
          to="/skin-test"
          className="inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-full bg-brand px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand/90 sm:min-w-0 sm:px-6"
        >
          {isEn ? 'Take skin test' : 'Пройти тест кожи'}
        </Link>
        <Link
          to="/shop"
          className="inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand sm:min-w-0 sm:px-6"
        >
          {isEn ? 'Go to catalog' : 'В каталог'}
        </Link>
      </div>
    </main>
  );
};
