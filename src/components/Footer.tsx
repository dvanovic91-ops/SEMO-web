import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { t } from '../i18n/messages';
import { APP_VERSION } from '../version';

/** 전역 푸터 — 저작권 + 오른쪽 하단 버전 표시 */
export const Footer: React.FC = () => {
  const { language } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-slate-100 bg-white pb-20 md:pb-0">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-500 md:justify-start">
          <Link to="/legal" className="hover:text-brand hover:underline">
            {t(language, 'footer', 'legal')}
          </Link>
          <Link to="/support" className="hover:text-brand hover:underline">
            {t(language, 'footer', 'faq')}
          </Link>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-400">
            © {year} SEMO box. {t(language, 'footer', 'rights')}
          </p>
          <p className="text-xs text-slate-400" title={t(language, 'footer', 'version')}>
            v{APP_VERSION}
          </p>
        </div>
      </div>
    </footer>
  );
};
