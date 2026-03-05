import React, { useRef, useState } from 'react';

type Props = {
  images: string[];
  name: string;
};

export const ShopCardImage: React.FC<Props> = ({ images, name }) => {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(0);

  const hasMultiple = images.length > 1;

  const startHover = () => {
    if (!hasMultiple) return;
    setIndex(1); // 마우스 오버 시 두 번째 이미지로 고정
  };

  const endHover = () => {
    setIndex(0); // 마우스 아웃 시 첫 번째 이미지로 복귀
  };

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

  if (!images.length) {
    return (
      <div
        className="mt-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-white/80"
        style={{ minHeight: '180px' }}
      >
        <span className="text-base font-medium text-brand">{name}</span>
      </div>
    );
  }

  return (
    <div
      className="mt-2 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-white/80"
      style={{ minHeight: '180px' }}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <img src={images[index]} alt={name} className="h-full w-full object-cover" />
    </div>
  );
};

