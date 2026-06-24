import React from 'react';
import { NAV_LOGO_IMG_CLASS } from '../lib/navLogoTune';

type SemoBoxLogoProps = {
  className?: string;
};

/** 상단 Navbar — semo box 워드마크 + 스파크 */
export function SemoBoxLogo({ className = '' }: SemoBoxLogoProps) {
  return (
    <img
      src="/logo-semobox-nav.png"
      alt="semo box"
      className={`${NAV_LOGO_IMG_CLASS} w-auto object-contain object-left ${className}`}
      width={926}
      height={140}
      decoding="async"
    />
  );
}
