import React, { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { getCroppedImageBlob } from '../lib/cropImage';

type Props = {
  /** object URL 또는 http(s) URL */
  imageSrc: string;
  open: boolean;
  onClose: () => void;
  /** 최종 JPEG 파일. `false` 반환 시 업로드 실패 등으로 모달 유지 */
  onApply: (file: File) => void | boolean | Promise<void | boolean>;
};

const ASPECT_PRESETS: { label: string; value: number | undefined }[] = [
  { label: '16:9', value: 16 / 9 },
  { label: '16:10', value: 16 / 10 },
  { label: '4:3', value: 4 / 3 },
  { label: '1:1', value: 1 },
  { label: '자유', value: undefined },
];

/**
 * 관리자 프로모 배너: 프레임(비율) 선택 + 확대/이동 + 미리보기 후 적용
 */
export const PromoImageCropModal: React.FC<Props> = ({ imageSrc, open, onClose, onApply }) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(16 / 9);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  /** 드래그 중 과도한 캔버스 호출 방지 */
  const [debouncedPixels, setDebouncedPixels] = useState<Area | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  React.useEffect(() => {
    const t = window.setTimeout(() => setDebouncedPixels(croppedAreaPixels), 350);
    return () => clearTimeout(t);
  }, [croppedAreaPixels]);

  /** 크롭 영역 안정화 후 미리보기 갱신 */
  React.useEffect(() => {
    if (!open || !imageSrc || !debouncedPixels) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const blob = await getCroppedImageBlob(imageSrc, debouncedPixels, 480, 0.85);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        setPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, imageSrc, debouncedPixels]);

  React.useEffect(() => {
    if (!open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setAspect(16 / 9);
      setCroppedAreaPixels(null);
      setDebouncedPixels(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [open]);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels);
      const file = new File([blob], 'promo-banner.jpg', { type: 'image/jpeg' });
      const applied = await Promise.resolve(onApply(file));
      if (applied !== false) onClose();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '크롭 처리 실패');
    } finally {
      setBusy(false);
    }
  };

  if (!open || !imageSrc) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">배너 이미지 자르기</h3>
          <p className="mt-0.5 text-xs text-slate-500">비율을 고른 뒤 드래그·확대하여 맞추세요. 아래에서 결과를 확인할 수 있습니다.</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 lg:flex-row">
          {/* react-easy-crop: 부모에 명시적 높이 필요 */}
          <div className="relative h-[min(52vh,420px)] min-h-[240px] w-full flex-1 overflow-hidden rounded-xl bg-slate-900">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              showGrid
            />
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 lg:w-52">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">프레임 비율</p>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => setAspect(p.value)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      aspect === p.value
                        ? 'border-brand bg-brand-soft/30 text-brand'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">확대 {Math.round(zoom * 100)}%</label>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-brand"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">미리보기 (저장 시 품질은 더 높음)</p>
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="block h-auto w-full" />
                ) : (
                  <div className="flex h-24 items-center justify-center text-xs text-slate-400">조정 중…</div>
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
            disabled={busy || !croppedAreaPixels}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {busy ? '처리 중…' : '이대로 업로드'}
          </button>
        </div>
      </div>
    </div>
  );
};
