import React from 'react';

type JourneyStepImageProps = {
  src: string;
  alt: string;
  loading?: 'lazy' | 'eager';
  className?: string;
};

/**
 * 우클릭·드래그 저장 완화(웹 한계 내). 터치 롱프레스 메뉴 완화용 touch-callout 제거.
 */
export function JourneyStepImage({ src, alt, loading = 'lazy', className = '' }: JourneyStepImageProps) {
  return (
    <div
      className={`relative select-none [-webkit-touch-callout:none] ${className}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading={loading}
        decoding="async"
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        className="block h-auto w-full select-none align-middle [-webkit-user-drag:none]"
      />
    </div>
  );
}
