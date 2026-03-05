import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Journey to SEMO — 주문부터 수령까지 한 그림. 5단계, 좌우 교차(사진/텍스트) 레이아웃.
 * 각 단계별 큰 이미지 영역 + 오른쪽 또는 왼쪽 텍스트.
 */
const STEPS: {
  titleEn: string;
  titleRu: string;
  description: string;
  /** 실제 이미지 URL 넣으면 여기 표시 (없으면 플레이스홀더) */
  imageUrl?: string;
  imagePlaceholder?: string;
}[] = [
  {
    titleEn: 'The Selection',
    titleRu: 'Тщательный подбор',
    description: 'Идеальный набор под ваш тип кожи. Мы подбираем продукты по результатам теста.',
    imagePlaceholder: 'Step 1',
  },
  {
    titleEn: 'Eco-friendly Wrap',
    titleRu: 'Экологичная упаковка',
    description: 'Забота SEMO об окружающей среде. Упаковка, которая бережёт природу.',
    imagePlaceholder: 'Step 2',
  },
  {
    titleEn: 'Safe Travel',
    titleRu: 'Безопасная доставка',
    description: 'Отправка после тщательной проверки. Ваш бокс в надёжных руках.',
    imagePlaceholder: 'Step 3',
  },
  {
    titleEn: 'The Moment',
    titleRu: 'Долгожданная встреча',
    description: 'Коробка у вашей двери. Доставка до порога.',
    imagePlaceholder: 'Step 4',
  },
  {
    titleEn: 'Unboxing',
    titleRu: 'Распаковка',
    description: 'Ваша персональная beauty-коробка. Наконец-то встреча с вашими продуктами.',
    imagePlaceholder: 'Step 5',
  },
];

export const Journey: React.FC = () => {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
          Как это работает
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          От заказа до получения — путь вашего SEMO бокса
        </p>
      </header>

      <section className="space-y-24 md:space-y-32">
        {STEPS.map((step, index) => {
          const isImageLeft = index % 2 === 0;
          const stepNum = index + 1;
          return (
            <article
              key={stepNum}
              className="grid gap-8 md:grid-cols-2 md:items-center md:gap-12 lg:gap-16"
            >
              {/* 이미지 영역: 큰 비율로 배치 (교차) */}
              <div
                className={`relative min-h-[320px] overflow-hidden rounded-2xl bg-slate-100 sm:min-h-[400px] md:min-h-[480px] lg:min-h-[520px] ${
                  isImageLeft ? '' : 'md:order-2'
                }`}
              >
                {step.imageUrl ? (
                  <img
                    src={step.imageUrl}
                    alt={step.titleRu}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-soft/30 to-slate-100">
                    <span className="text-4xl font-semibold text-slate-300 sm:text-5xl md:text-6xl">
                      {step.imagePlaceholder}
                    </span>
                  </div>
                )}
              </div>

              {/* 텍스트 영역 */}
              <div className={`flex flex-col justify-center ${isImageLeft ? '' : 'md:order-1'}`}>
                <span className="text-sm font-semibold tracking-wide text-brand">
                  Step {stepNum}
                </span>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {step.titleEn}
                </h2>
                <p className="mt-1 text-lg font-medium text-slate-700">
                  {step.titleRu}
                </p>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                  {step.description}
                </p>
              </div>
            </article>
          );
        })}
      </section>

      <div className="mt-24 flex justify-center pb-12">
        <Link
          to="/shop"
          className="rounded-full bg-brand px-8 py-3 text-sm font-semibold text-white transition hover:bg-brand/90"
        >
          В каталог
        </Link>
      </div>
    </main>
  );
};
