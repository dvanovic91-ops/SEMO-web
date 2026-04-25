import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';

const storyLine = 'prose-ru text-[0.95rem] leading-[1.85] text-slate-700 sm:text-base';
const highlight = 'font-medium text-brand';

/** SEMO orange box (премиальная коробка) — при необходимости замените файл в public */
const SEMO_ORANGE_BOX_IMG = '/images/journey/step4-unbox-beauty-box.png';

const storyCopy = {
  en: {
    headline: 'Skincare should not be a guessing game.',
    subheadline:
      'SEMO builds your routine around real skin data, verified ingredients, and trusted Korean beauty.',
    intro:
      'Have you ever felt lost in front of endless shelves or while scrolling through countless product pages? SEMO began with that exact uncertainty: “Will this really work for me?” and “Am I buying products I do not need?”',
    body:
      'SEMO makes skincare choices Smart and Easy. Through AI skin analysis and ingredient verification, we recommend Only for you products while helping reduce Minimal trial, waste, and cost. We do not simply sell what is trending. We start by understanding each product’s ingredients and checking whether they truly match your skin data.',
    conclusion:
      'We source directly from trusted Korean brands and select only verified, high-quality K-beauty. Your routine arrives as one All-in-One solution, safely delivered from Korea to your doorstep.',
    imageCaption: 'A complete skincare routine, packed into one SEMO box.',
    ctaLead: 'Not sure what your skin really needs? Start with the test.',
    ctaPrimary: 'Take skin test',
    ctaSecondary: 'Explore Beauty box',
  },
  ru: {
    headline: 'Хватит гадать. Начните уход, построенный на реальных данных вашей кожи.',
    subheadline:
      'SEMO создает ваш уход на основе реальных данных кожи, проверенных ингредиентов и надежной корейской косметики.',
    intro:
      'Вы когда-нибудь терялись перед полками с бесконечным количеством товаров или в длинных страницах интернет-магазина? SEMO начался именно с этой неопределенности: «Подойдет ли это мне?» и «Не покупаю ли я лишнее?»',
    body:
      'SEMO делает выбор ухода Smart и Easy. С помощью AI-анализа кожи и проверки состава мы рекомендуем продукты Only for you, помогая сократить Minimal количество проб, лишних покупок и затрат. Мы не просто продаем то, что модно. Мы начинаем с анализа ингредиентов и проверяем, действительно ли они подходят данным вашей кожи.',
    conclusion:
      'Мы напрямую закупаем продукты у надежных корейских брендов и отбираем только проверенные, качественные K-beauty средства. Ваш уход приходит как одно All-in-One решение, безопасно доставленное из Кореи прямо к вашей двери.',
    imageCaption: 'Полный уход за кожей, собранный в одном SEMO box.',
    ctaLead: 'Не уверены, что действительно нужно вашей коже? Начните с теста.',
    ctaPrimary: 'Пройти тест кожи',
    ctaSecondary: 'Смотреть Beauty box',
  },
};

/**
 * About SEMO — инфографика + история бренда (полный русский текст сохранён).
 */
export const About: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const copy = isEn ? storyCopy.en : storyCopy.ru;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <section>
        <div className="mx-auto max-w-5xl text-center">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.24em] text-brand">About SEMO</p>
          <h1 className="prose-ru mx-auto text-center text-[1.75rem] font-medium leading-tight tracking-tight text-slate-950 sm:text-[2.05rem] md:text-[2.35rem] lg:text-[2.55rem]">
            {copy.headline}
          </h1>
          <p className="prose-ru mx-auto mt-4 block max-w-full overflow-x-auto whitespace-nowrap text-center text-[clamp(0.7rem,1.2vw+0.35rem,1.05rem)] font-normal leading-relaxed text-slate-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {copy.subheadline}
          </p>
        </div>

        <div className="mt-9 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)] md:items-center md:gap-14 lg:mt-10 lg:gap-20">
          <div>
          <div className="space-y-5">
            <p className={storyLine}>{copy.intro}</p>
            <p className={storyLine}>
              {isEn ? (
                <>
                  SEMO makes skincare choices <strong className={highlight}>Smart</strong>: we start with AI skin
                  analysis and ingredient verification, not with trends. We make the process{' '}
                  <strong className={highlight}>Easy</strong> by narrowing countless products into a clear routine. We
                  help reduce <strong className={highlight}>Minimal</strong> trial, waste, and cost. And every
                  recommendation is <strong className={highlight}>Only for you</strong>, checked against your skin data.
                </>
              ) : (
                <>
                  SEMO делает выбор ухода <strong className={highlight}>Smart</strong>: мы начинаем с AI-анализа кожи и
                  проверки состава, а не с трендов. Мы делаем процесс <strong className={highlight}>Easy</strong>,
                  сужая бесконечный выбор до понятной рутины. Мы помогаем сократить{' '}
                  <strong className={highlight}>Minimal</strong> количество проб, лишних покупок и затрат. И каждая
                  рекомендация остается <strong className={highlight}>Only for you</strong>, проверенной по данным вашей
                  кожи.
                </>
              )}
            </p>
            <p className={storyLine}>
              {isEn ? (
                <>
                  We source directly from trusted Korean brands and select only verified, high-quality{' '}
                  <strong className={highlight}>K-beauty</strong>. Your routine arrives as one{' '}
                  <strong className={highlight}>All-in-One</strong> solution, safely delivered from Korea to your
                  doorstep.
                </>
              ) : (
                <>
                  Мы напрямую закупаем продукты у надежных корейских брендов и отбираем только проверенные, качественные{' '}
                  <strong className={highlight}>K-beauty</strong> средства. Ваш уход приходит как одно{' '}
                  <strong className={highlight}>All-in-One</strong> решение, безопасно доставленное из Кореи прямо к
                  вашей двери.
                </>
              )}
            </p>
          </div>

          <div className="mt-10">
            <p className="prose-ru mb-5 text-sm font-normal leading-relaxed text-slate-600 sm:text-[0.95rem]">
              {copy.ctaLead}
            </p>
            <div className="flex w-full flex-col gap-3 sm:max-w-xl sm:flex-row sm:gap-4">
              <Link
                to="/skin-test"
                className="inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-full bg-brand px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand/90"
              >
                {copy.ctaPrimary}
              </Link>
              <Link
                to="/shop"
                className="inline-flex min-h-[3rem] flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand"
              >
                {copy.ctaSecondary}
              </Link>
            </div>
          </div>
        </div>

          <figure className="mx-auto w-full max-w-xl md:max-w-none">
          <div className="overflow-hidden rounded-[2rem] bg-slate-100 shadow-[0_24px_70px_-35px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/80">
            <img
              src={SEMO_ORANGE_BOX_IMG}
              alt={isEn ? 'SEMO premium beauty box' : 'Премиальная коробка SEMO с уходовой косметикой'}
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          </div>
        </figure>
        </div>
      </section>
    </main>
  );
};
