import React from 'react';
import { Link } from 'react-router-dom';

/**
 * About SEMO — 브랜드·서비스 소개.
 */
export const About: React.FC = () => {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">
      <h1 className="text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
        About SEMO
      </h1>
      <p className="mt-8 text-lg leading-relaxed text-slate-600">
        SEMO beauty-box — это персональный подбор корейской уходовой косметики с доставкой из Кореи в Россию.
        Пройдите тест по типу кожи, получите рекомендации и закажите бокс, созданный под вас.
      </p>
      <p className="mt-6 text-base leading-relaxed text-slate-600">
        Доставка door-to-door, обновление бокса по сезонам. Только оригинальная корейская косметика.
      </p>
      <p className="mt-10">
        <Link to="/" className="text-sm text-slate-500 transition hover:text-brand">
          ← На главную
        </Link>
      </p>
    </main>
  );
};
