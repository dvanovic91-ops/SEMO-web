import React, { useRef, useState, useEffect } from 'react';

type Props = {
  images: string[];
  name: string;
  /** 모바일 1열: 이미지 영역을 넓고 선명하게 */
  layout?: 'mobile' | 'desktop';
};

export const ShopCardImage: React.FC<Props> = ({ images, name, layout = 'desktop' }) => {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(0);
  /** 항상 최신 images 참조 — 데이터 로드 후 마우스가 이미 카드 위에 있어도 호버 시 전환되도록 */
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const hasMultiple = images.length > 1;

  /** 호버 시점의 images 길이를 ref로 확인해, 로드 지연으로 처음에 1장이었어도 나중에 2장이면 전환 */
  const startHover = () => {
    if (imagesRef.current.length <= 1) return;
    setIndex(1);
  };

  const endHover = () => {
    setIndex(0);
  };

  /** images가 바뀌었을 때 인덱스 보정(1장 이하로 줄어들면 0으로) */
  useEffect(() => {
    if (images.length <= 1) setIndex(0);
    else if (index >= images.length) setIndex(0);
  }, [images]);

  /** 두 번째 이미지 미리 로드 — 호버 시 깜빡임 없이 바로 전환 */
  useEffect(() => {
    if (images.length < 2) return;
    const img = new Image();
    img.src = images[1];
  }, [images]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!hasMultiple) return;
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!hasMultiple) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) < 30) return;
    e.stopPropagation();
    setIndex((prev) => {
      if (dx < 0) {
        return (prev + 1) % images.length;
      }
      return (prev - 1 + images.length) % images.length;
    });
  };

  /** 동일 shell + aspect → 빈 슬롯·사진 슬롯 박스 크기 일치. 사진은 absolute로 꽉 채움( flex center 로 인한 축소 방지) */
  const shellClass =
    layout === 'mobile'
      ? 'relative mt-2 aspect-[4/3] w-full min-w-0 shrink-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/90 sm:aspect-square'
      : 'relative mt-2 aspect-square w-full min-w-0 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/90';

  if (!images.length) {
    return (
      <div className={`${shellClass} flex items-center justify-center`}>
        <span className="prose-ru line-clamp-3 px-2 text-center text-sm font-medium text-slate-400 sm:text-base">
          {name}
        </span>
      </div>
    );
  }

  return (
    <div
      className={shellClass}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img src={images[index]} alt={name} className="absolute inset-0 h-full w-full object-cover object-center" />
      {/* 모바일: 좌우 스와이프 가능 — 하단 점 표시 */}
      {hasMultiple && layout === 'mobile' && (
        <div className="pointer-events-none absolute bottom-2 left-0 right-0 flex justify-center gap-1.5" aria-hidden>
          {images.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-1.5 rounded-full shadow-sm transition ${
                i === index ? 'bg-white ring-2 ring-slate-500/80' : 'bg-white/70 ring-1 ring-slate-400/50'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
};

