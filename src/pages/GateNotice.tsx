import React from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * 홈(/)이 "준비 중" 안내로 닫혀있는 동안 쓰는 별도의 최소 고지 페이지.
 *
 * 기존 /legal(Legal.tsx)은 실제 쇼핑몰 운영 중을 전제로 한 문서(결제/배송/
 * 환불 조항 등)라, 지금처럼 스토어가 닫혀있는 상태에서 그 페이지를 그대로
 * 보여주면 "운영 중"이라는 인상을 줘서 앞뒤가 안 맞는다. 그래서 지금 상태에
 * 맞는, 사실 그대로의 짧은 고지만 담은 별도 페이지로 분리했다.
 *
 * 스토어를 다시 열면 ComingSoon.tsx의 링크를 다시 /legal로 되돌릴 것.
 *
 * 2026-08-27 도입.
 */
export const GateNotice: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';

  return (
    <main className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {isEn ? 'Notice' : 'Уведомление'}
      </h1>
      <p className="mt-6 text-sm leading-relaxed text-slate-600">
        {isEn
          ? 'SEMO box is not open for orders yet, so no payment or order data is collected on this site right now. We only record basic page-visit statistics to understand traffic.'
          : 'SEMO box пока не принимает заказы, поэтому сейчас на сайте не собираются данные об оплате или заказах. Мы фиксируем только базовую статистику посещений для анализа трафика.'}
      </p>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        {isEn
          ? 'Questions, or want your visit data removed? Contact '
          : 'Вопросы или хотите удалить данные о посещении? Пишите на '}
        <a href="mailto:semo@semo-box.com" className="text-brand hover:underline">
          semo@semo-box.com
        </a>
        .
      </p>
      <p className="mt-4 text-sm leading-relaxed text-slate-600">
        {isEn
          ? 'Once the shop opens, our full Privacy Policy and Terms of Service will apply here.'
          : 'Когда магазин откроется, здесь будут действовать полная Политика конфиденциальности и Пользовательское соглашение.'}
      </p>
    </main>
  );
};
