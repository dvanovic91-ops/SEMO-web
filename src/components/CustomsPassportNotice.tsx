import React, { useLayoutEffect, useRef, useState } from 'react';

/** ИНН / паспорт — таможня (3 строки, по центру) */
export const CUSTOMS_PASSPORT_NOTICE_LINES_RU = [
  'Обратите внимание:',
  'достоверность данных для таможенного оформления — ответственность получателя в рамках применимого законодательства.',
  'Пожалуйста, проверьте данные перед сохранением, чтобы избежать задержек.',
] as const;

export const CUSTOMS_PASSPORT_NOTICE_LINES_EN = [
  'Please note:',
  'The recipient is responsible for the accuracy of customs clearance data under applicable customs laws and regulations.',
  'Please verify your details before saving to avoid delays.',
] as const;

/** Одна строка — поиск/логи при необходимости */
export const CUSTOMS_PASSPORT_NOTICE_RU = CUSTOMS_PASSPORT_NOTICE_LINES_RU.join(' ');

const MIN_PX = 5;
const MAX_PX = 11;
const STEP = 0.25;
const WIDTH_PAD = 8;

/** 세 문장 중 가장 넓은 픽셀 너비 (줄바꿈 없음, font-medium·tracking-tight에 맞춤) */
function measureMaxLineWidthPx(
  lines: readonly string[],
  fontSizePx: number,
  fontFamily: string,
): number {
  if (typeof document === 'undefined') return 0;
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.style.cssText = [
    'position:absolute',
    'left:-99999px',
    'top:0',
    'visibility:hidden',
    'white-space:nowrap',
    'pointer-events:none',
    'font-weight:500',
    'letter-spacing:-0.025em',
    `font-size:${fontSizePx}px`,
    `font-family:${fontFamily}`,
  ].join(';');
  document.body.appendChild(span);
  let maxW = 0;
  for (const line of lines) {
    span.textContent = line;
    maxW = Math.max(maxW, span.offsetWidth);
  }
  document.body.removeChild(span);
  return maxW;
}

/**
 * 가로 스크롤·줄바꿈 없이 정확히 3줄: 너비에 맞는 최대 글자 크기를 측정해 적용.
 */
export const CustomsPassportNotice: React.FC<{ locale?: 'ru' | 'en' }> = ({ locale = 'ru' }) => {
  const lines = locale === 'en' ? CUSTOMS_PASSPORT_NOTICE_LINES_EN : CUSTOMS_PASSPORT_NOTICE_LINES_RU;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fontPx, setFontPx] = useState(MAX_PX);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const run = () => {
      const w = el.clientWidth;
      if (w < 12) return;
      const fontFamily = getComputedStyle(el).fontFamily || 'ui-sans-serif, system-ui, sans-serif';
      const avail = Math.max(0, w - WIDTH_PAD);

      let chosen = MIN_PX;
      for (let px = MAX_PX; px >= MIN_PX - 1e-9; px -= STEP) {
        const roundPx = Math.round(px * 100) / 100;
        const mw = measureMaxLineWidthPx(lines, roundPx, fontFamily);
        if (mw <= avail) {
          chosen = roundPx;
          break;
        }
      }
      setFontPx(chosen);
    };

    const schedule = () => {
      if (document.fonts?.ready) {
        void document.fonts.ready.then(run);
      } else {
        run();
      }
    };

    schedule();
    const ro = new ResizeObserver(() => schedule());
    ro.observe(el);
    return () => ro.disconnect();
  }, [lines]);

  return (
    <div
      ref={wrapRef}
      className="mt-2 -mx-4 w-[calc(100%+2rem)] overflow-x-hidden px-1 text-center sm:px-0"
      lang={locale === 'en' ? 'en' : 'ru'}
    >
      {lines.map((line, i) => (
        <p
          key={i}
          className={`whitespace-nowrap font-medium tracking-tight text-red-600 ${
            i > 0 ? 'mt-1.5 sm:mt-2' : ''
          }`}
          style={{ fontSize: fontPx, lineHeight: 1.35 }}
        >
          {line}
        </p>
      ))}
    </div>
  );
};
