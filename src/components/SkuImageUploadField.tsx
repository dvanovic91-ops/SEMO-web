import React, { useEffect, useRef, useState } from 'react';
import { SkuImageFitEditorModal } from './SkuImageFitEditorModal';
import { uploadSkuImageFile } from '../lib/uploadSkuImage';
import { removeBackground } from '../lib/removeBackground';

type SkuImageUploadFieldProps = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
};

/** SKU 제품 이미지 — 업로드 + 드래그·확대 크롭 + URL 직접 입력 */
export function SkuImageUploadField({ value, onChange, disabled }: SkuImageUploadFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<'removing' | 'uploading' | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    return () => {
      if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    };
  }, [cropSrc]);

  const openCrop = (file: File) => {
    if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setErr('');
    setCropSrc(URL.createObjectURL(file));
    setCropOpen(true);
  };

  const closeCrop = () => {
    setCropOpen(false);
    if (cropSrc?.startsWith('blob:')) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleApply = async (file: File) => {
    setUploading(true);
    setErr('');
    try {
      setUploadStep('uploading');
      const publicUrl = await uploadSkuImageFile(file);
      onChange(publicUrl);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : '업로드 실패');
      return false;
    } finally {
      setUploading(false);
      setUploadStep(null);
    }
  };

  const handleRemoveBg = async () => {
    if (!value) return;
    setUploading(true);
    setErr('');
    try {
      setUploadStep('removing');
      const imgRes = await fetch(value);
      const blob = await imgRes.blob();
      const file = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
      const removed = await removeBackground(file);
      setUploadStep('uploading');
      const publicUrl = await uploadSkuImageFile(removed);
      onChange(publicUrl);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '배경 제거 실패');
    } finally {
      setUploading(false);
      setUploadStep(null);
    }
  };

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">제품 이미지</label>
      <div className="flex flex-wrap items-start gap-3">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
              미리보기
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled || uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openCrop(f);
              e.target.value = '';
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-brand hover:text-brand disabled:opacity-50"
            >
              {uploadStep === 'uploading' ? '업로드 중…' : '이미지 선택 · 맞추기'}
            </button>
            {value && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={handleRemoveBg}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-violet-600 transition hover:border-violet-400 hover:bg-violet-50 disabled:opacity-50"
              >
                {uploadStep === 'removing' ? '배경 제거 중…' : '✂ 배경 지우기'}
              </button>
            )}
            {value && (
              <button
                type="button"
                disabled={disabled || uploading}
                onClick={() => onChange('')}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50"
              >
                제거
              </button>
            )}
          </div>
          <input
            type="url"
            value={value}
            disabled={disabled || uploading}
            onChange={(e) => onChange(e.target.value)}
            placeholder="또는 URL 직접 입력 (https://…)"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-50"
          />
          <p className="text-[10px] leading-snug text-slate-400">
            업로드 후 드래그·가장자리 핸들로 위치·크기를 자유롭게 맞출 수 있습니다 (비율 고정 없음).
          </p>
        </div>
      </div>
      {err && <p className="mt-1.5 text-[10px] text-red-600">{err}</p>}

      {cropSrc && (
        <SkuImageFitEditorModal
          imageSrc={cropSrc}
          open={cropOpen}
          onClose={closeCrop}
          onApply={handleApply}
        />
      )}
    </div>
  );
}
