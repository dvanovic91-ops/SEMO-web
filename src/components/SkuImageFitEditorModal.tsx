import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeFitDrawSize,
  DEFAULT_FIT_TRANSFORM,
  renderFitImageBlob,
  type FitImageTransform,
} from '../lib/renderFitImageBlob';

type Props = {
  imageSrc: string;
  open: boolean;
  onClose: () => void;
  onApply: (file: File) => void | boolean | Promise<void | boolean>;
};

const OUTPUT_SIZE = 800;
const DISPLAY_SIZE = 380;
const FIT_PADDING = 0.92;
const MIN_SCALE = 0.15;
const MAX_SCALE = 5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

type Handle =
  | 'move'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw';

type DragState = {
  handle: Handle;
  startX: number;
  startY: number;
  origin: FitImageTransform;
  baseW: number;
  baseH: number;
};

/**
 * SKU 제품 이미지 — 비율 고정 없이 드래그·가로/세로 독립 늘리기
 */
export function SkuImageFitEditorModal({ imageSrc, open, onClose, onApply }: Props) {
  const [transform, setTransform] = useState<FitImageTransform>(DEFAULT_FIT_TRANSFORM);
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockRatio, setLockRatio] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const displayRatio = DISPLAY_SIZE / OUTPUT_SIZE;

  useEffect(() => {
    if (!open || !imageSrc) {
      setImgNatural({ w: 0, h: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    if (imageSrc.startsWith('http://') || imageSrc.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = imageSrc;
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) {
      setTransform(DEFAULT_FIT_TRANSFORM);
      setLockRatio(false);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open || !imageSrc || !imgNatural.w) return;
    let cancelled = false;
    const t = window.setTimeout(() => {
      void renderFitImageBlob(imageSrc, transform, 480, '#ffffff', FIT_PADDING, 0.85)
        .then((blob) => {
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
        })
        .catch(() => setPreviewUrl(null));
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, imageSrc, transform, imgNatural.w]);

  const baseSize = imgNatural.w
    ? computeFitDrawSize(imgNatural.w, imgNatural.h, { ...transform, scaleX: 1, scaleY: 1 }, OUTPUT_SIZE, FIT_PADDING)
    : { width: 0, height: 0 };

  const drawSize = imgNatural.w
    ? computeFitDrawSize(imgNatural.w, imgNatural.h, transform, OUTPUT_SIZE, FIT_PADDING)
    : { width: 0, height: 0 };

  const displayW = drawSize.width * displayRatio;
  const displayH = drawSize.height * displayRatio;
  const displayLeft = DISPLAY_SIZE / 2 + transform.x * displayRatio - displayW / 2;
  const displayTop = DISPLAY_SIZE / 2 + transform.y * displayRatio - displayH / 2;

  const setScaleX = (next: number) => {
    setTransform((prev) => {
      const scaleX = clamp(next, MIN_SCALE, MAX_SCALE);
      if (!lockRatio) return { ...prev, scaleX };
      const ratio = prev.scaleY / prev.scaleX;
      return { ...prev, scaleX, scaleY: clamp(scaleX * ratio, MIN_SCALE, MAX_SCALE) };
    });
  };

  const setScaleY = (next: number) => {
    setTransform((prev) => {
      const scaleY = clamp(next, MIN_SCALE, MAX_SCALE);
      if (!lockRatio) return { ...prev, scaleY };
      const ratio = prev.scaleX / prev.scaleY;
      return { ...prev, scaleY, scaleX: clamp(scaleY * ratio, MIN_SCALE, MAX_SCALE) };
    });
  };

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    if (!imgNatural.w) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...transform },
      baseW: baseSize.width,
      baseH: baseSize.height,
    };
  };

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !imgNatural.w) return;

    const dx = (e.clientX - drag.startX) / displayRatio;
    const dy = (e.clientY - drag.startY) / displayRatio;
    const { handle, origin, baseW, baseH } = drag;

    if (handle === 'move') {
      setTransform({ ...origin, x: origin.x + dx, y: origin.y + dy });
      return;
    }

    let scaleX = origin.scaleX;
    let scaleY = origin.scaleY;

    const applyX = (delta: number) => {
      if (baseW <= 0) return;
      scaleX = clamp(origin.scaleX + (delta * 2) / baseW, MIN_SCALE, MAX_SCALE);
    };
    const applyY = (delta: number) => {
      if (baseH <= 0) return;
      scaleY = clamp(origin.scaleY + (delta * 2) / baseH, MIN_SCALE, MAX_SCALE);
    };

    if (handle.includes('e')) applyX(dx);
    if (handle.includes('w')) applyX(-dx);
    if (handle.includes('s')) applyY(dy);
    if (handle.includes('n')) applyY(-dy);

    if (lockRatio && handle !== 'move') {
      const avg =
        handle === 'n' || handle === 's'
          ? scaleY / origin.scaleY
          : handle === 'e' || handle === 'w'
            ? scaleX / origin.scaleX
            : (scaleX / origin.scaleX + scaleY / origin.scaleY) / 2;
      scaleX = clamp(origin.scaleX * avg, MIN_SCALE, MAX_SCALE);
      scaleY = clamp(origin.scaleY * avg, MIN_SCALE, MAX_SCALE);
    }

    setTransform({ ...origin, scaleX, scaleY });
  }, [displayRatio, imgNatural.w]);

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const handleApply = async () => {
    setBusy(true);
    try {
      const blob = await renderFitImageBlob(imageSrc, transform, OUTPUT_SIZE, '#ffffff');
      const file = new File([blob], 'sku-image.jpg', { type: 'image/jpeg' });
      const applied = await Promise.resolve(onApply(file));
      if (applied !== false) onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '이미지 처리 실패');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !imageSrc) return null;

  const handleDot = (h: Handle, className: string) => (
    <div
      key={h}
      role="presentation"
      onPointerDown={onPointerDown(h)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`absolute z-20 touch-none ${className}`}
    />
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">제품 이미지 맞추기</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            드래그로 위치를 옮기고, 가장자리·모서리를 잡아 가로·세로로 자유롭게 늘리세요. 비율은 깨져도 됩니다.
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 lg:flex-row">
          <div
            ref={frameRef}
            className="relative mx-auto overflow-hidden rounded-xl border border-slate-700 bg-white shadow-inner"
            style={{ width: DISPLAY_SIZE, height: DISPLAY_SIZE }}
          >
            <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-white/90" />

            {imgNatural.w > 0 && (
              <div
                className="absolute select-none"
                style={{
                  left: displayLeft,
                  top: displayTop,
                  width: displayW,
                  height: displayH,
                }}
              >
                <img
                  src={imageSrc}
                  alt=""
                  draggable={false}
                  className="pointer-events-none h-full w-full object-fill"
                />

                {/* 이동 영역 */}
                <div
                  className="absolute inset-3 z-10 cursor-move touch-none"
                  onPointerDown={onPointerDown('move')}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />

                {/* 가장자리 · 모서리 핸들 */}
                {handleDot('nw', '-left-1.5 -top-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-brand shadow')}
                {handleDot('n', 'left-1/2 -top-1.5 h-3 w-8 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-white bg-brand/90 shadow')}
                {handleDot('ne', '-right-1.5 -top-1.5 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-white bg-brand shadow')}
                {handleDot('e', '-right-1.5 top-1/2 h-8 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-brand/90 shadow')}
                {handleDot('se', '-bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-brand shadow')}
                {handleDot('s', 'bottom-[-6px] left-1/2 h-3 w-8 -translate-x-1/2 cursor-ns-resize rounded-full border-2 border-white bg-brand/90 shadow')}
                {handleDot('sw', '-bottom-1.5 -left-1.5 h-4 w-4 cursor-nesw-resize rounded-full border-2 border-white bg-brand shadow')}
                {handleDot('w', '-left-1.5 top-1/2 h-8 w-3 -translate-y-1/2 cursor-ew-resize rounded-full border-2 border-white bg-brand/90 shadow')}
              </div>
            )}
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-52">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={lockRatio}
                onChange={(e) => setLockRatio(e.target.checked)}
                className="accent-brand"
              />
              가로·세로 비율 함께 조절
            </label>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                가로 {Math.round(transform.scaleX * 100)}%
              </label>
              <input
                type="range"
                min={MIN_SCALE * 100}
                max={MAX_SCALE * 100}
                step={1}
                value={Math.round(transform.scaleX * 100)}
                onChange={(e) => setScaleX(Number(e.target.value) / 100)}
                className="w-full accent-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                세로 {Math.round(transform.scaleY * 100)}%
              </label>
              <input
                type="range"
                min={MIN_SCALE * 100}
                max={MAX_SCALE * 100}
                step={1}
                value={Math.round(transform.scaleY * 100)}
                onChange={(e) => setScaleY(Number(e.target.value) / 100)}
                className="w-full accent-brand"
              />
            </div>

            <button
              type="button"
              onClick={() => setTransform(DEFAULT_FIT_TRANSFORM)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              초기화
            </button>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">미리보기</p>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="block aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-xs text-slate-400">조정 중…</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleApply()}
            disabled={busy || !imgNatural.w}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {busy ? '처리 중…' : '업로드'}
          </button>
        </div>
      </div>
    </div>
  );
}
