import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Hair Beauty box 페이지 — 구조는 Shop(Beauty box)과 동일.
 * 현재는 준비 중 안내만 표시; 추후 상품 슬롯 연결.
 */
export const HairBeauty: React.FC = () => {
  return (
    <main className="mx-auto min-w-0 max-w-5xl px-3 py-10 sm:px-6 sm:py-16">
      <header className="mb-10 text-center sm:mb-14">
        <h1 className="prose-ru text-xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Hair Beauty Box
        </h1>
        <p className="prose-ru mx-auto mt-3 max-w-xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Корейский уход за волосами — шампуни, маски, сыворотки и масла для здоровых и блестящих волос.
        </p>
      </header>

      <section className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-20 text-center">
        <svg className="h-16 w-16 text-brand/40" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="32" cy="32" r="14" />
          <path d="M32 22v20M22 32h20" />
        </svg>
        <p className="text-lg font-medium text-slate-700">Скоро в продаже</p>
        <p className="max-w-md text-sm text-slate-500">
          Мы готовим подборку лучших корейских средств для ухода за волосами. Следите за обновлениями!
        </p>
        <Link
          to="/shop"
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:border-brand hover:text-brand"
        >
          Смотреть Beauty Box
        </Link>
      </section>
    </main>
  );
};
