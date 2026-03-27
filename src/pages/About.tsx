import React from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * About SEMO — 브랜드·서비스 소개.
 */
export const About: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
        About SEMO
      </h1>
      <p className="mt-8 text-lg leading-relaxed text-slate-600">
        {isEn
          ? 'SEMO Box is a personalized Korean skincare box service delivered from Korea to your address.'
          : 'SEMO box — это персональный подбор корейской уходовой косметики с доставкой из Кореи до вашего адреса.'}
        {' '}
        {isEn
          ? 'Take a skin type test, get recommendations, and order a box tailored to you.'
          : 'Пройдите тест по типу кожи, получите рекомендации и закажите бокс, созданный под вас.'}
      </p>
      <p className="mt-6 text-base leading-relaxed text-slate-600">
        {isEn
          ? 'Door-to-door delivery, seasonal box updates, and only authentic Korean cosmetics.'
          : 'Доставка door-to-door, обновление бокса по сезонам. Только оригинальная корейская косметика.'}
      </p>
    </main>
  );
};
