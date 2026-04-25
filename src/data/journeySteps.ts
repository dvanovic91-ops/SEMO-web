/**
 * Journey to SEMO — 4 steps (landing + /journey page 공통).
 */
export type JourneyStep = {
  title: { en: string; ru: string };
  description: { en: string; ru: string };
  imagePlaceholder: string;
  imageUrl?: string;
  titleSingleLineMd?: boolean;
};

export const JOURNEY_STEPS: JourneyStep[] = [
  {
    title: {
      en: 'AI Skin Analysis & Smart Matching',
      ru: 'AI-анализ кожи и умный подбор',
    },
    description: {
      en: 'We analyze your skin precisely using AI-powered Baumann tests and selfie diagnostics. Based on the data, SEMO configures the perfect combination for you, selected exclusively from our verified, high-quality product lineup.',
      ru: 'Мы точно анализируем вашу кожу с помощью AI-теста Баумана и селфи-диагностики. На основе этих данных SEMO подберет для вас идеальную комбинацию, составленную исключительно из нашей проверенной линейки высококачественных продуктов.',
    },
    imagePlaceholder: '1',
    imageUrl: '/images/journey/step1-ai-skin-analysis.png',
  },
  {
    title: {
      en: 'Easy Checkout & Secure Payment',
      ru: 'Простая оплата и готовность к таможне',
    },
    description: {
      en: 'Just enter your shipping info and customs ID—no complicated paperwork. Pay easily from anywhere in the world with a secure payment system that meets global standards.',
      ru: 'Просто введите адрес и данные для таможни — никаких лишних бумаг. Оплачивайте легко из любой точки мира через безопасную систему, соответствующую глобальным стандартам.',
    },
    imagePlaceholder: '2',
    imageUrl: '/images/journey/step2-checkout-secure-payment.png',
  },
  {
    title: {
      en: 'Direct Shipping & Seamless Tracking',
      ru: 'Прямая доставка и отслеживание',
    },
    description: {
      en: 'From Korea to your doorstep, SEMO seamlessly connects every step of the journey. We ensure 100% authentic products with transparent, real-time tracking.',
      ru: 'Из Кореи прямо к вашей двери — SEMO обеспечивает безупречность на каждом этапе. Мы гарантируем 100% подлинность товаров и прозрачное отслеживание в реальном времени.',
    },
    imagePlaceholder: '3',
    imageUrl: '/images/journey/step3-direct-shipping-tracking.png',
    titleSingleLineMd: true,
  },
  {
    title: {
      en: 'Unbox Your Perfect Skin Solution',
      ru: 'Ваше идеальное решение в одной коробке',
    },
    description: {
      en: 'Meet your personalized All-in-One beauty box delivered to your door. Stop worrying—start your perfect skincare today with the single solution completed by SEMO.',
      ru: 'Получите ваш персональный Beauty Box прямо у двери. Больше никаких сомнений — начните идеальный уход за кожей уже сегодня с готовым решением от SEMO.',
    },
    imagePlaceholder: '4',
    imageUrl: '/images/journey/step4-unbox-beauty-box.png',
  },
];

/** Journey 상단 소제목: 한 줄 (clamp + 매우 좁은 화면은 부모 `overflow-x-auto`) */
export const JOURNEY_INTRO_SUBLINE_CLASS =
  'prose-ru mx-auto mt-4 block w-full min-w-0 whitespace-nowrap px-2 text-center text-[clamp(0.5rem,1.85vw+0.35rem,1.125rem)] leading-snug text-slate-600 sm:px-4 sm:text-[clamp(0.5625rem,1.15vw+0.42rem,1.25rem)] md:text-lg';
