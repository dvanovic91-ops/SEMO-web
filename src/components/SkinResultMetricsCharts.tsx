import React, { useMemo } from 'react';
import { resolveConcernMetricFocus, type SelfieMetricKey } from '../lib/concernMetricHighlight';

/**
 * 셀피 0–100 → 막대용 −10…+10 스케일 (50=중립).
 * 상단 구간은 시각만 완화: 100이 막대 끝까지 차 보이며 부담되는 느낌을 줄임.
 */
function photoValueToBarC(value0to100: number): number {
  const v = Math.max(0, Math.min(100, value0to100));
  const softened = v <= 78 ? v : 78 + (v - 78) * 0.42;
  return (softened - 50) / 5;
}

export type SelfieMetricsInput = {
  redness_index?: number;
  pigment_unevenness?: number;
  texture_roughness?: number;
  oiliness_index?: number;
  /** 트러블/뾰루지 (NEW) */
  blemishes_index?: number;
  /** 칙칙함 (NEW) */
  dullness_index?: number;
  /** 잔결/탄력 신호 — 27세 이상만 표시 (NEW) */
  fine_lines_index?: number;
};

type Props = {
  scores: Record<1 | 2 | 3 | 4, number>;
  skinMetrics?: SelfieMetricsInput | null;
  isEn: boolean;
  /** 프로필 고민(con_*) + 자유 텍스트 — 연관 지표 테두리 */
  concernProfileCode?: string;
  concernFreeText?: string;
  /** 나이 코드 — age_3(26–30) 이상이면 잔결 지표 표시 */
  ageCode?: string;
};

type PolePair = { left: string; right: string };
type BarColor = 'brand' | 'photo';

type BaumannAxisConfig = {
  poles: PolePair;
  positiveOn: 'left' | 'right';
};

const AGE_SHOW_FINE_LINES = new Set(['age_3', 'age_4', 'age_5', 'age_6', 'age_7']);

function SourceBadge({ source, isEn }: { source: BarColor; isEn: boolean }) {
  if (source === 'brand') {
    return (
      <span className="mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-brand/10 text-brand">
        {isEn ? 'Survey' : 'Опрос'}
      </span>
    );
  }
  return (
    <span className="mr-1.5 inline-block rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-sky-100 text-sky-600">
      {isEn ? 'Photo' : 'Фото'}
    </span>
  );
}

function CenterAxisRow({
  poles,
  raw,
  positiveOn,
  metricTitle,
  highlightConcern,
  barColor = 'brand',
  isEn,
  note,
}: {
  poles: PolePair;
  raw: number;
  positiveOn: 'left' | 'right';
  metricTitle?: string;
  highlightConcern?: boolean;
  barColor?: BarColor;
  isEn: boolean;
  note?: string;
}) {
  const c = Math.max(-10, Math.min(10, Number.isFinite(raw) ? raw : 0));
  const mag = Math.abs(c) / 10;
  const w = c === 0 ? 0 : Math.max(mag * 50, 0.5);

  const leftActive = positiveOn === 'left' ? c > 0 : c < 0;
  const rightActive = positiveOn === 'left' ? c < 0 : c > 0;
  const poleClass = (active: boolean) =>
    active
      ? barColor === 'photo'
        ? 'font-bold text-sky-600'
        : 'font-bold text-brand'
      : 'font-medium text-slate-500';

  const barBg = barColor === 'photo' ? 'bg-sky-500' : 'bg-brand';
  const segCommon = `absolute top-0 z-[1] h-full ${barBg} shadow-sm transition-[width,left] duration-300 ease-out`;

  let barInner: React.ReactNode = null;
  if (c !== 0) {
    if (positiveOn === 'left') {
      if (c > 0) {
        barInner = <div className={`${segCommon} rounded-l-full rounded-r-none`} style={{ left: `${50 - w}%`, width: `${w}%` }} />;
      } else {
        barInner = <div className={`${segCommon} rounded-l-none rounded-r-full`} style={{ left: '50%', width: `${w}%` }} />;
      }
    } else if (c > 0) {
      barInner = <div className={`${segCommon} rounded-l-none rounded-r-full`} style={{ left: '50%', width: `${w}%` }} />;
    } else {
      barInner = <div className={`${segCommon} rounded-l-full rounded-r-none`} style={{ left: `${50 - w}%`, width: `${w}%` }} />;
    }
  }

  const ring = highlightConcern
    ? barColor === 'photo'
      ? 'rounded-xl border-2 border-sky-400/50 bg-sky-50/40 px-2.5 py-2.5 shadow-sm sm:px-3 sm:py-3'
      : 'rounded-xl border-2 border-brand/45 bg-brand-soft/20 px-2.5 py-2.5 shadow-sm sm:px-3 sm:py-3'
    : '';

  return (
    <div className={`mb-4 last:mb-0 ${ring}`}>
      {metricTitle ? (
        <p className="mb-1 flex items-center text-[10px] font-medium uppercase tracking-wide text-slate-500">
          <SourceBadge source={barColor} isEn={isEn} />
          {metricTitle}
        </p>
      ) : null}
      {note ? (
        <p className="mb-1.5 text-[9px] leading-snug text-slate-400">{note}</p>
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
  ageCode,
}) => {
  const focus = useMemo(
    () => resolveConcernMetricFocus(concernProfileCode, concernFreeText ?? ''),
    [concernProfileCode, concernFreeText],
  );
  const hasFocus = focus.baumannRowIndices.size > 0 || focus.selfieKeys.size > 0;
  const showFineLines = AGE_SHOW_FINE_LINES.has(ageCode ?? '');

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
      return { poles: cfg.poles, positiveOn: cfg.positiveOn, raw: num };
    });
  }, [scores, axisConfigs]);

  const selfieRows = useMemo(() => {
    if (!skinMetrics || typeof skinMetrics !== 'object') return [];
    const clamp = (n: unknown) => {
      const x = Number(n);
      return Math.max(0, Math.min(100, Number.isFinite(x) ? Math.round(x) : 0));
    };

    // 순서: 색소불균일(바우만 색소와 연결) → 붉음증 → 칙칙함 → 트러블 → 유분 → 텍스처 → 잔결(27+)
    type PhotoRowDef = {
      key: keyof SelfieMetricsInput;
      metricKey: SelfieMetricKey | 'blemishes_index' | 'dullness_index' | 'fine_lines_index';
      title: string;
      left: string;
      right: string;
      note?: string;
      show?: boolean;
    };

    const rows: PhotoRowDef[] = isEn
      ? [
          {
            key: 'pigment_unevenness', metricKey: 'pigment_unevenness',
            title: 'Tone unevenness (photo)',
            left: 'Lower', right: 'Higher',
            note: '↳ Supplements the "Pigmented / Clear tone" questionnaire axis above — photo signal from one shot.',
          },
          { key: 'redness_index', metricKey: 'redness_index', title: 'Redness (photo)', left: 'Lower', right: 'Higher' },
          { key: 'dullness_index', metricKey: 'dullness_index', title: 'Dullness (photo)', left: 'Lower', right: 'Higher' },
          { key: 'blemishes_index', metricKey: 'blemishes_index', title: 'Blemishes (photo)', left: 'Lower', right: 'Higher' },
          { key: 'oiliness_index', metricKey: 'oiliness_index', title: 'T-zone gloss (photo)', left: 'Lower', right: 'Higher' },
          { key: 'texture_roughness', metricKey: 'texture_roughness', title: 'Texture (photo)', left: 'Lower', right: 'Higher' },
          {
            key: 'fine_lines_index', metricKey: 'fine_lines_index',
            title: 'Fine lines / firmness signal (photo)',
            left: 'Lower', right: 'Higher',
            note: 'Lighting-dependent signal. Re-check with consistent setup.',
            show: showFineLines,
          },
        ]
      : [
          {
            key: 'pigment_unevenness', metricKey: 'pigment_unevenness',
            title: 'Неровность тона (фото)',
            left: 'Ниже', right: 'Выше',
            note: '↳ Дополняет ось «Пигментная / Ровный тон» выше — сигнал с одного снимка.',
          },
          { key: 'redness_index', metricKey: 'redness_index', title: 'Покраснение (фото)', left: 'Ниже', right: 'Выше' },
          { key: 'dullness_index', metricKey: 'dullness_index', title: 'Тусклость кожи (фото)', left: 'Ниже', right: 'Выше' },
          { key: 'blemishes_index', metricKey: 'blemishes_index', title: 'Высыпания (фото)', left: 'Ниже', right: 'Выше' },
          { key: 'oiliness_index', metricKey: 'oiliness_index', title: 'Блеск T-зоны (фото)', left: 'Ниже', right: 'Выше' },
          { key: 'texture_roughness', metricKey: 'texture_roughness', title: 'Текстура (фото)', left: 'Ниже', right: 'Выше' },
          {
            key: 'fine_lines_index', metricKey: 'fine_lines_index',
            title: 'Мелкие линии / упругость (фото)',
            left: 'Ниже', right: 'Выше',
            note: 'Сигнал зависит от освещения. Для сравнения снимайте в одинаковых условиях.',
            show: showFineLines,
          },
        ];

    return rows
      .filter((r) => r.show !== false)
      .map((row) => ({
        metricKey: row.metricKey,
        metricTitle: row.title,
        poles: { left: row.left, right: row.right },
        raw: photoValueToBarC(clamp(skinMetrics[row.key as keyof SelfieMetricsInput] ?? 0)),
        note: row.note,
      }));
  }, [skinMetrics, isEn, showFineLines]);

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

      {/* 바우만 설문 */}
      <div className="mt-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {isEn ? 'Baumann questionnaire' : 'Опрос Baumann'}
        </p>
        {baumannRows.map((row, idx) => (
          <CenterAxisRow
            key={idx}
            poles={row.poles}
            raw={row.raw}
            positiveOn={row.positiveOn}
            highlightConcern={focus.baumannRowIndices.has(idx)}
            barColor="brand"
            isEn={isEn}
          />
        ))}
      </div>

      {/* 셀카 사진 지표 */}
      {selfieRows.length > 0 ? (
        <div className="mt-5 border-t border-slate-200 pt-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
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
              barColor="photo"
              isEn={isEn}
              note={row.note}
            />
          ))}
        </div>
      ) : null}

      <p className="mt-4 border-t border-slate-200 pt-3 text-[10px] leading-snug text-slate-500 sm:text-[11px]">
        {isEn
          ? 'Bars show tendencies from the questionnaire and image-based signals from one photo. Not a clinical grade — lighting, angle, and model limits can affect values.'
          : 'Полосы показывают склонности по опросу и сигналы с одного снимка. Это не клиническая оценка — свет, ракурс и ограничения модели могут влиять на значения.'}
      </p>
    </div>
  );
};
