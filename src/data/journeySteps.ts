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
      en: 'Skin Type Test & Smart Matching',
      ru: 'Тест типа кожи и умный подбор',
    },
    description: {
      en: 'Answer a quick skin type test and SEMO matches you with the exact products your skin needs — only official bestsellers that top Korea\'s own store shelves.',
      ru: 'Пройдите короткий тест типа кожи, и SEMO подберёт именно те продукты, которые нужны вашей коже — только официальные бестселлеры с полок ведущих корейских магазинов.',
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
      en: 'No customs headaches — we handle all the paperwork for you. Just enter your address and pay the way you like, through a secure payment system.',
      ru: 'Никаких сложностей с таможней — мы всё оформим за вас. Просто укажите адрес и оплатите удобным способом через безопасную платёжную систему.',
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
      en: 'Orders ship directly from Korea twice a month — on the 15th and 30th. Follow your box in real time, from our hands to your door.',
      ru: 'Заказы отправляются напрямую из Кореи дважды в месяц — 15-го и 30-го числа. Следите за посылкой в реальном времени — от отправки до вашей двери.',
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
      en: 'Open the box — inside is your complete routine, matched to your skin. From test to perfect skincare, all in one step.',
      ru: 'Откройте коробку — внутри полный уход, подобранный именно для вашей кожи. От теста до идеальной рутины — один шаг.',
    },
    imagePlaceholder: '4',
    imageUrl: '/images/journey/step4-unbox-beauty-box.png',
  },
];

/** Journey 상단 소제목: 한 줄 (clamp + 매우 좁은 화면은 부모 `overflow-x-auto`) */
export const JOURNEY_INTRO_SUBLINE_CLASS =
  'prose-ru mx-auto mt-4 block w-full min-w-0 whitespace-nowrap px-2 text-center text-[clamp(0.5rem,1.85vw+0.35rem,1.125rem)] leading-snug text-slate-600 sm:px-4 sm:text-[clamp(0.5625rem,1.15vw+0.42rem,1.25rem)] md:text-lg';
