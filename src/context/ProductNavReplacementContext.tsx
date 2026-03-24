import React, { createContext, useContext, useMemo, useState } from 'react';

/** md+: 상품 상세 — 고정 헤더에서 컴팩트 시 가격·CTA 표시용 */
export type ProductDesktopNavBridge = {
  compact: boolean;
  rrp: number | null;
  prp: number | null;
  thumbUrl?: string | null;
  onAddToCart: () => void;
};

type Ctx = {
  /** 모바일: 상품 상세 스크롤 미니바가 보일 때 SEMO 상단 헤더 대신 표시 */
  productStickyReplacesNav: boolean;
  setProductStickyReplacesNav: (v: boolean) => void;
  /** md+: 로드된 상품 상세 — Navbar 고정·컴팩트 슬롯 데이터 */
  productDesktopNav: ProductDesktopNavBridge | null;
  setProductDesktopNav: (v: ProductDesktopNavBridge | null) => void;
};

const ProductNavReplacementContext = createContext<Ctx | null>(null);

export function ProductNavReplacementProvider({ children }: { children: React.ReactNode }) {
  const [productStickyReplacesNav, setProductStickyReplacesNav] = useState(false);
  const [productDesktopNav, setProductDesktopNav] = useState<ProductDesktopNavBridge | null>(null);
  const value = useMemo(
    () => ({
      productStickyReplacesNav,
      setProductStickyReplacesNav,
      productDesktopNav,
      setProductDesktopNav,
    }),
    [productStickyReplacesNav, productDesktopNav],
  );
  return <ProductNavReplacementContext.Provider value={value}>{children}</ProductNavReplacementContext.Provider>;
}

export function useProductNavReplacement(): Ctx {
  const ctx = useContext(ProductNavReplacementContext);
  if (!ctx) {
    return {
      productStickyReplacesNav: false,
      setProductStickyReplacesNav: () => {},
      productDesktopNav: null,
      setProductDesktopNav: () => {},
    };
  }
  return ctx;
}
