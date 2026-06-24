import React, { useEffect } from 'react';
import { useI18n } from '../context/I18nContext';

type Props = {
  open: boolean;
  onClose: () => void;
  onTakeTest: () => void;
  onChooseSelf: () => void;
};

const STEP_LABELS = {
  ru: ['Клинсер', 'Тонер', 'Сыворотка', 'Ампула', 'Крем', 'SPF'],
  en: ['Cleanser', 'Toner', 'Serum', 'Ampoule', 'Cream', 'SPF'],
};

/** 이모지 대신 — 브랜드 톤 스파클 (개인 맞춤 느낌) */
function PersonalPickIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2.5l1.05 3.32 3.45 1.13-3.45 1.13L12 11.4l-1.05-3.32-3.45-1.13 3.45-1.13L12 2.5z"
        fill="currentColor"
        opacity="0.95"
      />
      <path
        d="M18.6 13.2l.55 1.75 1.85.6-1.85.6-.55 1.75-.55-1.75-1.85-.6 1.85-.6.55-1.75z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M5.8 15.4l.45 1.42 1.5.48-1.5.48-.45 1.42-.45-1.42-1.5-.48 1.5-.48.45-1.42z"
        fill="currentColor"
        opacity="0.55"
      />
    </svg>
  );
}

export function BuildBoxTestNudgeModal({ open, onClose, onTakeTest, onChooseSelf }: Props) {
  const { language } = useI18n();
  const isEn = language === 'en';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const steps = isEn ? STEP_LABELS.en : STEP_LABELS.ru;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 p-4 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="build-box-nudge-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[min(100%,28rem)] overflow-hidden rounded-2xl bg-white shadow-[0_24px_48px_-12px_rgba(15,23,42,0.22)] sm:max-w-[30rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 bg-brand" aria-hidden />

        <div className="relative px-7 pb-7 pt-5 sm:px-9 sm:pb-8 sm:pt-6">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label={isEn ? 'Close' : 'Закрыть'}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="mb-5 flex justify-center pt-1">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft/50 text-brand ring-1 ring-brand/15">
              <PersonalPickIcon />
            </span>
          </div>

          <p className="mb-2.5 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
            {isEn ? 'Personalized picks' : 'Персональный подбор'}
          </p>

          <h2
            id="build-box-nudge-title"
            className="prose-ru mx-auto max-w-[22rem] text-balance text-center text-[1.0625rem] font-semibold leading-[1.38] tracking-tight text-slate-900 sm:max-w-none sm:text-[1.125rem]"
          >
            {isEn ? (
              <>Build your box with &ldquo;For you&rdquo; picks</>
            ) : (
              <>
                <span className="block">Собери бокс с подсказками</span>
                <span className="mt-0.5 block text-brand">«Для тебя»</span>
              </>
            )}
          </h2>

          <p className="prose-ru mx-auto mt-3 text-center text-[13px] leading-[1.55] text-slate-600 sm:text-sm sm:leading-relaxed">
            {isEn ? (
              <>
                A short quiz — 3&nbsp;minutes, free. In each category we&apos;ll highlight the best match for your
                skin.
              </>
            ) : (
              <>
                <span className="block">Короткий тест — 3&nbsp;минуты, бесплатно.</span>
                <span className="mt-1 block whitespace-nowrap text-[11px] tracking-[-0.01em] sm:text-[13px] sm:tracking-normal">
                  В&nbsp;каждой категории отметим лучший вариант для&nbsp;твоей кожи.
                </span>
              </>
            )}
          </p>

          <div className="mx-auto mt-5 grid max-w-[17.5rem] grid-cols-3 gap-1.5 sm:max-w-[19rem]">
            {steps.map((label) => (
              <span
                key={label}
                className="flex items-center justify-center rounded-full bg-slate-100 px-2 py-1 text-center text-[10px] font-medium leading-tight text-slate-500"
              >
                {label}
              </span>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onTakeTest}
              className="w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand/90 active:scale-[0.99]"
            >
              {isEn ? 'Take the quiz' : 'Пройти тест'}
            </button>
            <button
              type="button"
              onClick={onChooseSelf}
              className="w-full rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99]"
            >
              {isEn ? 'Choose on my own' : 'Выбрать самому'}
            </button>
          </div>

          <p className="prose-ru mx-auto mt-4 max-w-[20rem] text-pretty text-center text-[11px] leading-[1.45] text-slate-400">
            {isEn ? (
              <>Without the quiz — no &ldquo;For you&rdquo; badge</>
            ) : (
              <>Без теста — без метки «Для&nbsp;тебя»</>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
