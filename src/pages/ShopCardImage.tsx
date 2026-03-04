import React, { useEffect, useRef, useState } from 'react';

type Props = {
  images: string[];
  name: string;
};

export const ShopCardImage: React.FC<Props> = ({ images, name }) => {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<number | null>(null);
  const touchStartX = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  const hasMultiple = images.length > 1;

  const startHover = () => {
    if (!hasMultiple || timerRef.current != null) return;
    timerRef.current = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % images.length);
    }, 1200);
  };

  const endHover = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIndex(0);
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
        className="mt-4 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-white/80"
        style={{ minHeight: '180px' }}
      >
        <span className="text-base font-medium text-brand">{name}</span>
      </div>
    );
  }

  return (
    <div
      className="mt-4 flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-slate-200/80 bg-white/80"
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

