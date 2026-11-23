import React from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * Deepkor(화장품 성분분석 앱)의 이용약관/개인정보처리방침 — SEMO box와는
 * 다른 서비스지만, 같은 사업자(세모박스)가 운영하고 아직 Deepkor 전용
 * 도메인이 없어서 이 사이트(semo-box.com)의 /deepkor/* 경로에 얹어둔다.
 * SEMO box 자체의 /legal 과는 무관 — 절대 그 라우트와 합치지 말 것.
 *
 * 본문은 앱 코드의 lib/content/legal_content.dart 와 내용을 맞춰야 한다 —
 * 둘 중 하나만 고치면 서로 어긋나니, 문구를 바꿀 땐 항상 양쪽 다 갱신할 것.
 * (2026-08-27: 앱에 자체 탈퇴 기능이 이미 구현되어 있어서, 구버전 문구에
 * 있던 "이메일로 요청하면 90일 내 삭제"는 빼고 앱 내 삭제 경로로 정정했다.)
 *
 * 2026-08-27 도입.
 */

import { legalDocs, type Section } from './deepkorLegalContent';

const sectionClass = 'border-t border-slate-100 pt-8 first:border-t-0 first:pt-0';
const h2Class = 'text-base font-semibold text-slate-900 sm:text-lg';
const pClass = 'mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600';

const DeepkorLegalPage: React.FC<{ title: string; sections: Section[] }> = ({ title, sections }) => (
  <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
    <header className="mb-8 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">KOSKOS</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
    </header>
    <div className="space-y-8">
      {sections.map((s) => (
        <section key={s.heading} className={sectionClass}>
          <h2 className={h2Class}>{s.heading}</h2>
          <p className={pClass} style={{ wordBreak: 'keep-all' }}>{s.body}</p>
        </section>
      ))}
    </div>
  </main>
);

// 2026-11-24: 본문은 앱(lib/content/legal_content.dart)에서 자동으로 내보낸 deepkorLegalContent.ts만 쓴다.
// 앱이 ?lang=ko|en|ru 를 붙여 열면 그 언어, 없으면 사이트 언어. 한국어는 방침만 있고 약관은 영어로 보인다.
type Lang = 'en' | 'ru' | 'ko';
const useLegalLang = (): Lang => {
  const { language } = useI18n();
  const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : null;
  if (q === 'ko' || q === 'en' || q === 'ru') return q;
  return language === 'en' ? 'en' : 'ru';
};
const TITLES = {
  terms: { en: 'Terms of Service', ru: 'Пользовательское соглашение', ko: '이용약관' },
  privacy: { en: 'Privacy Policy', ru: 'Политика конфиденциальности', ko: '개인정보처리방침' },
} as const;

const pick = (doc: 'terms' | 'privacy', lang: Lang): { lang: Lang; sections: Section[] } => {
  const set = legalDocs[doc];
  if (set[lang]) return { lang, sections: set[lang] };
  return { lang: 'en', sections: set.en };
};

export const DeepkorTerms: React.FC = () => {
  const p = pick('terms', useLegalLang());
  return <DeepkorLegalPage title={TITLES.terms[p.lang]} sections={p.sections} />;
};

export const DeepkorPrivacy: React.FC = () => {
  const p = pick('privacy', useLegalLang());
  return <DeepkorLegalPage title={TITLES.privacy[p.lang]} sections={p.sections} />;
};
