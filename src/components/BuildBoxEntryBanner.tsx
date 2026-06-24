import React, { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { fetchUserBaumannType, SKIN_TEST_RETURN_KEY } from '../lib/userBaumannType';
import { BuildBoxTestNudgeModal } from './BuildBoxTestNudgeModal';

type BuildBoxEntryBannerProps = {
  className?: string;
};

/** /shop · 뷰티박스 탭 공통 — 나만의 박스 만들기 진입 배너 */
export function BuildBoxEntryBanner({ className = 'mb-10' }: BuildBoxEntryBannerProps) {
  const { language } = useI18n();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const isEn = language === 'en';

  const [nudgeOpen, setNudgeOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  /** null = 미조회, true/false = 캐시 */
  const hasBaumannRef = useRef<boolean | null>(null);

  const goBuild = useCallback(() => {
    navigate('/shop/build');
  }, [navigate]);

  const goTest = useCallback(() => {
    try {
      sessionStorage.setItem(SKIN_TEST_RETURN_KEY, '/shop/build');
    } catch {
      /* private mode */
    }
    navigate('/skin-test');
  }, [navigate]);

  const handleStart = useCallback(async () => {
    if (hasBaumannRef.current === true) {
      goBuild();
      return;
    }

    if (!supabase || !userId) {
      hasBaumannRef.current = false;
      setNudgeOpen(true);
      return;
    }

    setStarting(true);
    try {
      const bt = await fetchUserBaumannType(supabase, userId);
      hasBaumannRef.current = !!bt;
      if (bt) goBuild();
      else setNudgeOpen(true);
    } catch {
      setNudgeOpen(true);
    } finally {
      setStarting(false);
    }
  }, [goBuild, userId]);

  return (
    <>
      <div className={`mx-auto w-full max-w-3xl px-2 sm:px-0 ${className}`}>
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={starting}
          className="group relative flex w-full flex-col overflow-hidden rounded-2xl bg-brand px-6 py-7 text-left shadow-[0_8px_30px_-12px_rgba(230,84,39,0.45)] transition hover:bg-brand/95 disabled:opacity-90 sm:flex-row sm:items-center sm:gap-8 sm:px-10 sm:py-9"
        >
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-white/10"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-8 right-16 h-32 w-32 rounded-full bg-white/5"
            aria-hidden
          />

          <div className="relative min-w-0 flex-1">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
              {isEn ? 'Personalized care' : 'Персональный уход'}
            </p>
            <h2 className="text-xl font-bold leading-tight text-white sm:text-2xl md:text-3xl">
              {isEn ? 'Build your own box' : 'Соберите свой бокс'}
            </h2>
            <p className="prose-ru mt-2 max-w-md text-sm leading-relaxed text-white/85 sm:text-[15px]">
              {isEn
                ? 'Choose skincare for your skin type and complete a personal K-beauty box.'
                : 'Подберите средства по типу кожи и соберите персональный K-beauty бокс.'}
            </p>
          </div>

          <span className="relative mt-5 inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-white px-6 py-3 text-sm font-bold text-brand shadow-sm transition group-hover:bg-slate-50 group-disabled:opacity-80 sm:mt-0 sm:self-auto">
            {starting ? (isEn ? '…' : '…') : isEn ? 'Start' : 'Начать'}
            {!starting && (
              <span aria-hidden className="transition group-hover:translate-x-0.5">
                →
              </span>
            )}
          </span>
        </button>
      </div>

      <BuildBoxTestNudgeModal
        open={nudgeOpen}
        onClose={() => setNudgeOpen(false)}
        onTakeTest={() => {
          setNudgeOpen(false);
          goTest();
        }}
        onChooseSelf={() => {
          setNudgeOpen(false);
          goBuild();
        }}
      />
    </>
  );
}
