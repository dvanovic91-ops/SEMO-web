import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';

const storyLine = 'prose-ru text-[0.95rem] leading-[1.85] text-slate-700 sm:text-base';
const highlight = 'font-medium text-brand';

const storyCopy = {
  en: {
    headline: 'Skincare should not be a guessing game.',
    subheadline: 'SEMO finds your perfect K-beauty box.',
    imageCaption: 'A complete skincare routine, packed into one SEMO box.',
    ctaLead: 'Not sure what your skin really needs? Start with the test.',
    ctaPrimary: 'Take skin test',
    ctaSecondary: 'Explore Beauty box',
  },
  ru: {
    headline: 'Уход за кожей — не игра в догадки.',
    subheadline: 'SEMO подбирает ваш идеальный K-beauty box.',
    imageCaption: 'Полный уход за кожей, собранный в одном SEMO box.',
    ctaLead: 'Не уверены, что действительно нужно вашей коже? Начните с теста.',
    ctaPrimary: 'Пройти тест кожи',
    ctaSecondary: 'Смотреть Beauty box',
  },
};

/**
 * About SEMO — 브랜드 스토리 (공감 → 해결, 짧게 두 문단).
 */
export const About: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const copy = isEn ? storyCopy.en : storyCopy.ru;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:py-10">
      <section>
        <div className="mx-auto max-w-5xl text-center">
          <h1 className="prose-ru mx-auto text-center text-[1.75rem] font-medium leading-tight tracking-tight text-slate-950 sm:text-[2.05rem] md:text-[2.35rem] lg:text-[2.55rem]">
            {copy.headline}
          </h1>
          <p className="prose-ru mx-auto mt-4 block max-w-full overflow-x-auto whitespace-nowrap text-center text-[clamp(0.7rem,1.2vw+0.35rem,1.05rem)] font-normal leading-relaxed text-slate-600 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {copy.subheadline}
          </p>
        </div>

        {/* 브랜드 스토리 — 중앙 단일 컬럼, 읽기 좋은 폭 */}
        <div className="mx-auto mt-8 max-w-2xl space-y-5 text-center sm:mt-10">
          <p className={storyLine}>
            {isEn ? (
              <>
                Endless shelves, countless reviews — and still the same questions: “Will this actually
                work for me?” “Do I even need this?” SEMO began exactly there.
              </>
            ) : (
              <>
                Бесконечные полки, сотни отзывов — и всё те же вопросы: «Подойдёт ли это мне?»,
                «Нужно ли мне это вообще?» SEMO начался именно с этого.
              </>
            )}
          </p>
          <p className={storyLine}>
            {isEn ? (
              <>
                So we removed the guesswork: a short <strong className={highlight}>skin type test</strong>, a
                routine built from Korea’s real <strong className={highlight}>bestsellers</strong>, and{' '}
                <strong className={highlight}>one box</strong> at your door. Nothing you don’t need.
              </>
            ) : (
              <>
                Поэтому мы убрали догадки: короткий <strong className={highlight}>тест типа кожи</strong>,
                рутина из настоящих <strong className={highlight}>корейских бестселлеров</strong> — и{' '}
                <strong className={highlight}>один бокс</strong> у вашей двери. Ничего лишнего.
              </>
            )}
          </p>
        </div>
      </section>

      {/* ─── Why SEMO — 차별성 4가지 (구분선 없이 자연스럽게 이어짐) ─── */}
      <section className="mt-14 sm:mt-16">
        <h2 className="prose-ru text-center text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl md:text-[1.7rem]">
          {isEn ? 'What makes SEMO different' : 'Чем SEMO отличается'}
        </h2>
        <div className="mx-auto mt-10 grid max-w-4xl gap-x-12 gap-y-10 sm:mt-12 md:grid-cols-2">
          {(isEn ? WHY_SEMO.en : WHY_SEMO.ru).map((item, i) => (
            <div key={item.title} className="flex gap-4">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                {i + 1}
              </span>
              <div>
                <h3 className="prose-ru text-base font-semibold text-slate-900 sm:text-lg">{item.title}</h3>
                <p className="prose-ru mt-2 text-[0.95rem] leading-[1.8] text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA — 설득이 끝난 지점에 배치 */}
        <div className="mx-auto mt-14 max-w-xl text-center sm:mt-16">
          <p className="prose-ru mb-5 text-sm font-normal leading-relaxed text-slate-600 sm:text-[0.95rem]">
            {copy.ctaLead}
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:gap-4">
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
      </section>
    </main>
  );
};

/** Why SEMO — 차별성 카피 (EN/RU) */
const WHY_SEMO = {
  en: [
    {
      title: 'We watch the shelves, not the trends.',
      body:
        'Many products sold abroad as “K-beauty” are export-only lines Koreans have never heard of. SEMO carries only what actually tops the shelves of Korea’s biggest beauty stores — the products Koreans buy for themselves.',
    },
    {
      title: 'Bought in Korea, same as Koreans buy.',
      body:
        'We purchase every item directly in Korea — the same stores, the same official stock. No grey warehouses, no near-expiry batches. What arrives at your door is exactly what’s sold in Seoul today.',
    },
    {
      title: 'Your skin type decides, not our margin.',
      body:
        'Every recommendation starts from your skin type test based on the Baumann framework used in dermatology. The box is built around what your skin needs — not around what’s most profitable to sell.',
    },
    {
      title: 'Packed by people, not a conveyor belt.',
      body:
        'We are a small team, and every box is checked and packed by hand before it leaves Korea. If something is wrong, you talk to us directly — not to a call-center script.',
    },
  ],
  ru: [
    {
      title: 'Мы смотрим на полки, а не на тренды.',
      body:
        'Многое из того, что продаётся за рубежом как «K-beauty», — экспортные линейки, о которых корейцы даже не слышали. В SEMO только то, что действительно занимает полки крупнейших бьюти-магазинов Кореи — то, что корейцы покупают для себя.',
    },
    {
      title: 'Куплено в Корее — как покупают сами корейцы.',
      body:
        'Каждый продукт мы покупаем напрямую в Корее — в тех же магазинах, из того же официального ассортимента. Никаких серых складов и партий с истекающим сроком. К вам приезжает ровно то, что сегодня продаётся в Сеуле.',
    },
    {
      title: 'Решает ваш тип кожи, а не наша маржа.',
      body:
        'Каждая рекомендация начинается с теста типа кожи по методике Баумана, используемой в дерматологии. Бокс собирается вокруг того, что нужно вашей коже, — а не того, что выгоднее продать.',
    },
    {
      title: 'Собирают люди, а не конвейер.',
      body:
        'Мы небольшая команда, и каждый бокс проверяется и упаковывается вручную перед отправкой из Кореи. Если что-то не так — вы говорите напрямую с нами, а не со скриптом колл-центра.',
    },
  ],
};
