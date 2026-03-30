import React, { useMemo } from 'react';
import { resolveConcernMetricFocus, type SelfieMetricKey } from '../lib/concernMetricHighlight';

/** 셀피 0–100 → 막대용 −10…+10 스케일 (50=중립) */
function photoValueToBarC(value0to100: number): number {
  const v = Math.max(0, Math.min(100, value0to100));
  return (v - 50) / 5;
}

export type SelfieMetricsInput = {
  redness_index?: number;
  pigment_unevenness?: number;
  texture_roughness?: number;
  oiliness_index?: number;
};

type Props = {
  scores: Record<1 | 2 | 3 | 4, number>;
  skinMetrics?: SelfieMetricsInput | null;
  isEn: boolean;
  /** 프로필 고민(con_*) + 자유 텍스트 — 연관 지표 테두리 */
  concernProfileCode?: string;
  concernFreeText?: string;
};

type PolePair = { left: string; right: string };

type BaumannAxisConfig = {
  poles: PolePair;
  positiveOn: 'left' | 'right';
};

function CenterAxisRow({
  poles,
  raw,
  positiveOn,
  metricTitle,
  highlightConcern,
}: {
  poles: PolePair;
  /** 막대 폭·볼드용: −10…+10 (중앙 0) */
  raw: number;
  positiveOn: 'left' | 'right';
  /** 셀피 등 — 바우만과 동일 두 극 + 위에 지표명만 */
  metricTitle?: string;
  /** 고민과 연관된 축/지표 */
  highlightConcern?: boolean;
}) {
  const c = Math.max(-10, Math.min(10, Number.isFinite(raw) ? raw : 0));
  const mag = Math.abs(c) / 10;
  const w = c === 0 ? 0 : Math.max(mag * 50, 0.5);

  const leftActive = positiveOn === 'left' ? c > 0 : c < 0;
  const rightActive = positiveOn === 'left' ? c < 0 : c > 0;
  const poleClass = (active: boolean) =>
    active ? 'font-bold text-brand' : 'font-medium text-slate-500';

  const segCommon =
    'absolute top-0 z-[1] h-full bg-brand shadow-sm transition-[width,left] duration-300 ease-out';

  let barInner: React.ReactNode = null;
  if (c !== 0) {
    if (positiveOn === 'left') {
      if (c > 0) {
        barInner = (
          <div
            className={`${segCommon} rounded-l-full rounded-r-none`}
            style={{ left: `${50 - w}%`, width: `${w}%` }}
          />
        );
      } else {
        barInner = (
          <div
            className={`${segCommon} rounded-l-none rounded-r-full`}
            style={{ left: '50%', width: `${w}%` }}
          />
        );
      }
    } else if (c > 0) {
      barInner = (
        <div
          className={`${segCommon} rounded-l-none rounded-r-full`}
          style={{ left: '50%', width: `${w}%` }}
        />
      );
    } else {
      barInner = (
        <div
          className={`${segCommon} rounded-l-full rounded-r-none`}
          style={{ left: `${50 - w}%`, width: `${w}%` }}
        />
      );
    }
  }

  const ring = highlightConcern
    ? 'rounded-xl border-2 border-brand/45 bg-brand-soft/20 px-2.5 py-2.5 shadow-sm sm:px-3 sm:py-3'
    : '';

  return (
    <div className={`mb-4 last:mb-0 ${ring}`}>
      {metricTitle ? (
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{metricTitle}</p>
      ) : null}
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] leading-tight sm:text-xs">
        <span className={`min-w-0 flex-1 text-left ${poleClass(leftActive)}`}>{poles.left}</span>
        <span className={`min-w-0 flex-1 text-right ${poleClass(rightActive)}`}>{poles.right}</span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full ring-1 ring-slate-200/90">
        <div className="pointer-events-none absolute inset-0 flex">
          <div className="h-full w-1/2 bg-slate-100/95" />
          <div className="h-full w-1/2 bg-slate-200/75" />
        </div>
        {barInner}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-[2] w-[2px] -translate-x-1/2 bg-slate-500/35" />
      </div>
    </div>
  );
}

export const SkinResultMetricsCharts: React.FC<Props> = ({
  scores,
  skinMetrics,
  isEn,
  concernProfileCode,
  concernFreeText,
}) => {
  const focus = useMemo(
    () => resolveConcernMetricFocus(concernProfileCode, concernFreeText ?? ''),
    [concernProfileCode, concernFreeText],
  );
  const hasFocus = focus.baumannRowIndices.size > 0 || focus.selfieKeys.size > 0;
  const axisConfigs: BaumannAxisConfig[] = useMemo(() => {
    return isEn
      ? [
          { poles: { left: 'Dry', right: 'Oily' }, positiveOn: 'left' },
          { poles: { left: 'Sensitive', right: 'Resistant' }, positiveOn: 'left' },
          { poles: { left: 'Pigmented', right: 'Clear tone' }, positiveOn: 'left' },
          { poles: { left: 'Tight / firm', right: 'Wrinkle-prone' }, positiveOn: 'right' },
        ]
      : [
          { poles: { left: 'Сухость', right: 'Жирность' }, positiveOn: 'left' },
          { poles: { left: 'Чувствительная', right: 'Устойчивая' }, positiveOn: 'left' },
          { poles: { left: 'Пигментная', right: 'Ровный тон' }, positiveOn: 'left' },
          { poles: { left: 'Упругая', right: 'Склонность к морщинам' }, positiveOn: 'right' },
        ];
  }, [isEn]);

  const baumannRows = useMemo(() => {
    const keys = [1, 2, 3, 4] as const;
    return keys.map((k, i) => {
      const raw = scores[k];
      const r = typeof raw === 'number' && Number.isFinite(raw) ? raw : Number(raw);
      const num = Number.isFinite(r) ? r : 0;
      const cfg = axisConfigs[i]!;
      return {
        poles: cfg.poles,
        positiveOn: cfg.positiveOn,
        raw: num,
      };
    });
  }, [scores, axisConfigs]);

  const selfieRows = useMemo(() => {
    if (!skinMetrics || typeof skinMetrics !== 'object') return [];
    const L = isEn
      ? [
          { key: 'redness_index' as const, title: 'Redness', left: 'Low', right: 'High' },
          { key: 'pigment_unevenness' as const, title: 'Pigmentation', left: 'Low', right: 'High' },
          { key: 'texture_roughness' as const, title: 'Texture', left: 'Low', right: 'High' },
          { key: 'oiliness_index' as const, title: 'T-zone gloss', left: 'Low', right: 'High' },
        ]
      : [
          { key: 'redness_index' as const, title: 'Покраснение', left: 'Ниже', right: 'Выше' },
          { key: 'pigment_unevenness' as const, title: 'Пигментация', left: 'Ниже', right: 'Выше' },
          { key: 'texture_roughness' as const, title: 'Текстура', left: 'Ниже', right: 'Выше' },
          { key: 'oiliness_index' as const, title: 'Блеск T-зоны', left: 'Ниже', right: 'Выше' },
        ];
    const clamp = (n: unknown) => {
      const x = Number(n);
      return Math.max(0, Math.min(100, Number.isFinite(x) ? Math.round(x) : 0));
    };
    return L.map((row) => ({
      metricKey: row.key,
      metricTitle: row.title,
      poles: { left: row.left, right: row.right },
      raw: photoValueToBarC(clamp(skinMetrics[row.key])),
    }));
  }, [skinMetrics, isEn]);

  const titleCombined = isEn ? 'Questionnaire & photo scores' : 'Опросник и фото — показатели';

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-4 sm:px-5 sm:py-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand">{titleCombined}</p>
      {hasFocus ? (
        <p className="mt-2 text-[10px] leading-snug text-slate-600 sm:text-[11px]">
          {isEn
            ? 'Outlined rows are linked to the skin concern you selected or described.'
            : 'Обведённые шкалы связаны с выбранной или описанной вами проблемой кожи.'}
        </p>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {isEn ? 'Baumann questionnaire' : 'Опрос Baumann'}
        </p>
        {baumannRows.map((row, idx) => (
          <CenterAxisRow
            key={idx}
            poles={row.poles}
            raw={row.raw}
            positiveOn={row.positiveOn}
            highlightConcern={focus.baumannRowIndices.has(idx)}
          />
        ))}
      </div>

      {selfieRows.length > 0 ? (
        <div className="mt-6 border-t border-slate-200 pt-5">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
            {isEn ? 'Selfie (photo)' : 'Селфи (фото)'}
          </p>
          {selfieRows.map((row, idx) => (
            <CenterAxisRow
              key={`selfie-${idx}`}
              poles={row.poles}
              raw={row.raw}
              positiveOn="right"
              metricTitle={row.metricTitle}
              highlightConcern={focus.selfieKeys.has(row.metricKey as SelfieMetricKey)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
