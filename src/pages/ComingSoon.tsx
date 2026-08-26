import React from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * 임시 홈 화면 — 쇼핑몰(장바구니/결제 등)은 아직 판매 준비 단계라 루트(/)만
 * 이 안내 화면으로 교체한다. 상단 Navbar·하단 Footer(회사정보)도 App.tsx의
 * `isGate` 분기에서 이 라우트일 때만 같이 걷어냄 — 진짜 사진 한 장짜리
 * 화면으로 보이게 하기 위함. 나머지 페이지(/shop, /cart, /checkout 등)는
 * 코드상 그대로 있고 주소를 직접 알면 들어가짐 — 판매 시작할 준비가 되면
 * App.tsx에서 `/` 라우트만 다시 <Home />으로 되돌리면 된다.
 *
 * 2026-08-27 도입.
 */
const TELEGRAM_BOT_URL = 'https://t.me/My_SEMO_Beautybot';

export const ComingSoon: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-slate-950">
      <img
        src="/images/journey/step4-unbox-beauty-box.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 via-45% to-black/10" />

      <div className="relative flex min-h-screen flex-col items-center justify-end px-6 pb-16 pt-24 text-center sm:pb-20">
        <p className="mb-4 select-none font-sans text-lg font-semibold tracking-tight sm:text-xl">
          <span className="text-brand">semo</span>
          <span className="text-white"> box</span>
        </p>
        <h1 className="max-w-md font-serif text-2xl font-medium leading-snug text-white sm:text-3xl">
          {isEn ? 'Korean beauty, made for you.' : 'Корейская красота — для вас.'}
        </h1>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-white/70 sm:text-base">
          {isEn
            ? 'A more personal way to enjoy K-beauty is on its way.'
            : 'Скоро — более персональный подход к K-beauty.'}
        </p>

        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3 text-sm font-medium text-white transition hover:opacity-90"
        >
          {isEn ? 'Follow on Telegram' : 'Подписаться в Telegram'}
        </a>
      </div>
    </main>
  );
};
