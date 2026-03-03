import React from 'react';

/** 전역 푸터 — 저작권만 표시 (Support/Home/Beauty Box 링크 제거) */
export const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-white pb-20 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <p className="text-center text-xs text-slate-400">
          © {year} SEMO beauty-box. All rights reserved.
        </p>
      </div>
    </footer>
  );
};
