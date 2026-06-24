import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SemoBoxLogo } from '../../components/SemoBoxLogo';
import {
  loadNavLogoTune,
  NAV_LOGO_TUNE_DEFAULTS,
  navLogoTuneEquals,
  normalizeNavLogoTune,
  previewNavLogoTune,
  revertNavLogoTuneToSaved,
  saveNavLogoTune,
  type NavLogoTune,
} from '../../lib/navLogoTune';

type SliderRowProps = {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit: string;
  onChange: (v: number) => void;
};

function SliderRow({ label, hint, min, max, step, value, unit, onChange }: SliderRowProps) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-slate-800">{label}</span>
        <span className="shrink-0 tabular-nums text-sm text-brand">
          {value.toFixed(step < 1 ? 2 : step < 0.1 ? 1 : 0)}
          {unit}
        </span>
      </div>
      {hint ? <p className="mb-2 text-xs text-slate-500">{hint}</p> : null}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer accent-brand"
      />
    </label>
  );
}

/** 임시 — Navbar 왼쪽 로고 크기·위치 튜닝 (localStorage) */
export function NavLogoTuneTab() {
  const [saved, setSaved] = useState<NavLogoTune>(() => loadNavLogoTune());
  const [draft, setDraft] = useState<NavLogoTune>(() => loadNavLogoTune());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const dirty = useMemo(() => !navLogoTuneEquals(draft, saved), [draft, saved]);

  const patch = useCallback((partial: Partial<NavLogoTune>) => {
    setSaveMsg(null);
    setDraft((prev) => previewNavLogoTune({ ...prev, ...partial }));
  }, []);

  const handleCancel = useCallback(() => {
    previewNavLogoTune(saved);
    setDraft(saved);
    setSaveMsg(null);
  }, [saved]);

  const handleSave = useCallback(() => {
    const next = saveNavLogoTune(draft);
    setSaved(next);
    setDraft(next);
    setSavedAt(new Date().toLocaleTimeString());
    setSaveMsg('✅ 저장됐습니다.');
  }, [draft]);

  /** 탭 이탈·다른 admin 탭 이동 시 미저장 변경 되돌림 */
  useEffect(() => {
    return () => {
      revertNavLogoTuneToSaved();
    };
  }, []);

  return (
    <section className="mx-auto mt-6 max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">임시 탭</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Navbar 로고 크기 · 위치</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          슬라이더는 <strong className="font-semibold text-slate-800">미리보기만</strong> 바꿉니다.{' '}
          <strong className="font-semibold text-slate-800">저장하기</strong>를 눌러야 이 브라우저에 고정됩니다.
          저장하지 않고 탭을 나가면 마지막 저장값으로 돌아갑니다.
        </p>
      </div>

      {dirty ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          저장되지 않은 변경이 있습니다. 저장하기를 누르거나 취소로 되돌리세요.
        </p>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">미리보기</p>
        <div className="flex min-h-[3.5rem] items-center rounded-xl border border-slate-200 bg-white px-4 py-3">
          <SemoBoxLogo />
        </div>
        {savedAt ? (
          <p className="mt-2 text-xs text-slate-400">마지막 저장: {savedAt}</p>
        ) : null}
        {saveMsg ? <p className="mt-2 text-xs text-emerald-700">{saveMsg}</p> : null}
      </div>

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-900">높이</h3>
        <SliderRow
          label="모바일 (&lt;640px)"
          min={0.8}
          max={3.5}
          step={0.05}
          unit=" rem"
          value={draft.hMobileRem}
          onChange={(v) => patch({ hMobileRem: v })}
        />
        <SliderRow
          label="sm (640px+)"
          min={0.8}
          max={4}
          step={0.05}
          unit=" rem"
          value={draft.hSmRem}
          onChange={(v) => patch({ hSmRem: v })}
        />
        <SliderRow
          label="md (768px+, 데스크톱 Navbar)"
          min={0.8}
          max={4.5}
          step={0.05}
          unit=" rem"
          value={draft.hMdRem}
          onChange={(v) => patch({ hMdRem: v })}
        />
      </div>

      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h3 className="text-sm font-semibold text-slate-900">너비 · 위치</h3>
        <SliderRow
          label="모바일 max-width (rem)"
          min={6}
          max={20}
          step={0.25}
          unit=" rem"
          value={draft.maxWMobileRem}
          onChange={(v) => patch({ maxWMobileRem: v })}
        />
        <SliderRow
          label="모바일 max-width (vw)"
          hint="좁은 화면에서 로고가 잘리지 않게"
          min={30}
          max={90}
          step={1}
          unit=" vw"
          value={draft.maxWMobileVw}
          onChange={(v) => patch({ maxWMobileVw: v })}
        />
        <SliderRow
          label="데스크톱 max-width (rem)"
          min={8}
          max={22}
          step={0.25}
          unit=" rem"
          value={draft.maxWMdRem}
          onChange={(v) => patch({ maxWMdRem: v })}
        />
        <SliderRow
          label="왼쪽 offset"
          hint="음수 = 왼쪽으로, 양수 = 오른쪽으로"
          min={-2}
          max={3}
          step={0.05}
          unit=" rem"
          value={draft.offsetXRem}
          onChange={(v) => patch({ offsetXRem: v })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          저장하기
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={!dirty}
          className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => {
            setSaveMsg(null);
            setDraft(previewNavLogoTune({ ...NAV_LOGO_TUNE_DEFAULTS }));
          }}
          className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          기본값 미리보기
        </button>
        <Link
          to="/skin-test"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-brand/30 bg-brand-soft/20 px-4 py-2 text-sm font-medium text-brand hover:bg-brand-soft/40"
        >
          /skin-test 에서 확인 →
        </Link>
      </div>

      <details className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">JSON — 미리보기(draft) / 저장됨(saved)</summary>
        <p className="mt-2 font-medium text-slate-700">draft (미저장)</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(draft, null, 2)}</pre>
        <p className="mt-3 font-medium text-slate-700">saved</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{JSON.stringify(saved, null, 2)}</pre>
        <p className="mt-3 font-medium text-slate-700">factory default</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-slate-500">
          {JSON.stringify(normalizeNavLogoTune(NAV_LOGO_TUNE_DEFAULTS), null, 2)}
        </pre>
      </details>
    </section>
  );
}
