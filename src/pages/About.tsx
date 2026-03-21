import React from 'react';

/**
 * About SEMO — 브랜드·서비스 소개.
 */
export const About: React.FC = () => {
  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
        About SEMO
      </h1>
      <p className="mt-8 text-lg leading-relaxed text-slate-600">
        SEMO box — это персональный подбор корейской уходовой косметики с доставкой из Кореи в Россию.
        Пройдите тест по типу кожи, получите рекомендации и закажите бокс, созданный под вас.
      </p>
      <p className="mt-6 text-base leading-relaxed text-slate-600">
        Доставка door-to-door, обновление бокса по сезонам. Только оригинальная корейская косметика.
      </p>
    </main>
  );
};
