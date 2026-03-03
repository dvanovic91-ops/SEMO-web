import React from 'react';
import { APP_VERSION } from '../version';

/** 전역 푸터 — 저작권 + 오른쪽 하단 버전 표시 */
export const Footer: React.FC = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-white pb-20 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            © {year} SEMO beauty-box. All rights reserved.
          </p>
          <p className="text-xs text-slate-400" title="Версия">
            v{APP_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
};
