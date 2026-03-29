import React, { useMemo } from 'react';

/** 바우만 축 점수 (대략 -10…+10) → 0–100 (50=중립) */
function axisScoreToBar100(s: unknown): number {
  const n = typeof s === 'number' && Number.isFinite(s) ? s : Number(s);
  if (!Number.isFinite(n)) return 50;
  const c = Math.max(-10, Math.min(10, n));
  return Math.round(50 + (c / 10) * 50);
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
};

function MetricBar({ label, value, fillClass }: { label: string; value: number; fillClass: string }) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(value) ? Math.round(value) : 0));
  return (
    <div className="mb-3.5 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs text-slate-600">
        <span className="min-w-0 flex-1 leading-snug">{label}</span>
        <span className="shrink-0 tabular-nums font-medium text-slate-800">{safe}</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/90">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${fillClass}`}
          style={{ width: `${safe}%` }}
        />
      </div>
    </div>
  );
}

export const SkinResultMetricsCharts: React.FC<Props> = ({ scores, skinMetrics, isEn }) => {
  const baumannRows = useMemo(() => {
    const L = isEn
      ? {
          a1: 'Dry (+) ← → Oily (−)',
          a2: 'Sensitive (+) ← → Resistant (−)',
          a3: 'Pigmented (+) ← → Clear (−)',
          a4: 'Wrinkle-prone (+) ← → Tight (−)',
        }
      : {
          a1: 'Сухость (+) ← → Жирность (−)',
          a2: 'Чувств. (+) ← → Устойч. (−)',
          a3: 'Пигмент (+) ← → Ровный тон (−)',
          a4: 'Морщины (+) ← → Упругость (−)',
        };
    return [
      { name: L.a1, value: axisScoreToBar100(scores[1]), raw: scores[1] },
      { name: L.a2, value: axisScoreToBar100(scores[2]), raw: scores[2] },
      { name: L.a3, value: axisScoreToBar100(scores[3]), raw: scores[3] },
      { name: L.a4, value: axisScoreToBar100(scores[4]), raw: scores[4] },
    ];
  }, [scores, isEn]);

  const selfieRows = useMemo(() => {
    if (!skinMetrics || typeof skinMetrics !== 'object') return [];
    const L = isEn
      ? { r: 'Redness', p: 'Pigmentation', t: 'Texture', o: 'T-zone gloss' }
      : { r: 'Покраснение', p: 'Пигментация', t: 'Текстура', o: 'Блеск T-зоны' };
    const clamp = (n: unknown) => {
      const x = Number(n);
      return Math.max(0, Math.min(100, Number.isFinite(x) ? Math.round(x) : 0));
    };
    return [
      { name: L.r, value: clamp(skinMetrics.redness_index) },
      { name: L.p, value: clamp(skinMetrics.pigment_unevenness) },
      { name: L.t, value: clamp(skinMetrics.texture_roughness) },
      { name: L.o, value: clamp(skinMetrics.oiliness_index) },
    ];
  }, [skinMetrics, isEn]);

  const titleBaumann = isEn ? 'Baumann questionnaire — axis scores' : 'Опрос Baumann — оси';
  const titleSelfie = isEn ? 'Photo analysis — image signals (0–100)' : 'Анализ фото — сигналы (0–100)';
  const noteBaumann = isEn
    ? 'Bar shows tendency from the Q&A (50 = neutral). Not a clinical measurement.'
    : 'Столбец — тенденция по ответам (50 = нейтрально). Не клиническое измерение.';
  const noteSelfie = isEn
    ? 'Higher = stronger visual signal in that dimension on this photo (lighting affects gloss).'
    : 'Выше — сильнее визуальный сигнал на этом снимке (на блеск влияет свет).';

  return (
    <div className="mt-5 space-y-6 rounded-xl border border-slate-200 bg-slate-50/40 px-3 py-4 sm:px-5 sm:py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">{titleBaumann}</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-500">{noteBaumann}</p>
        <div className="mt-4 space-y-1">
          {baumannRows.map((row) => (
            <MetricBar key={row.name} label={`${row.name} · raw ${row.raw}`} value={row.value} fillClass="bg-brand" />
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-6 text-[10px] text-slate-400">
          <span>{isEn ? '← Oily / Resistant / …' : '← Жирн. / Устойч. / …'}</span>
          <span className="font-medium text-slate-500">50</span>
          <span>{isEn ? 'Dry / Sensitive / … →' : 'Сух. / Чувств. / … →'}</span>
        </div>
      </div>

      {selfieRows.length > 0 ? (
        <div className="border-t border-slate-200 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">{titleSelfie}</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">{noteSelfie}</p>
          <div className="mt-4 space-y-1">
            {selfieRows.map((row) => (
              <MetricBar key={row.name} label={`${row.name} /100`} value={row.value} fillClass="bg-orange-300" />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
