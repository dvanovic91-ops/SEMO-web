import React, { createContext, useContext, useMemo, useState } from 'react';

type Ctx = {
  /** 모바일: 상품 상세 스크롤 미니바가 보일 때 SEMO 상단 헤더 대신 표시 */
  productStickyReplacesNav: boolean;
  setProductStickyReplacesNav: (v: boolean) => void;
};

const ProductNavReplacementContext = createContext<Ctx | null>(null);

export function ProductNavReplacementProvider({ children }: { children: React.ReactNode }) {
  const [productStickyReplacesNav, setProductStickyReplacesNav] = useState(false);
  const value = useMemo(
    () => ({ productStickyReplacesNav, setProductStickyReplacesNav }),
    [productStickyReplacesNav],
  );
  return <ProductNavReplacementContext.Provider value={value}>{children}</ProductNavReplacementContext.Provider>;
}

export function useProductNavReplacement(): Ctx {
  const ctx = useContext(ProductNavReplacementContext);
  if (!ctx) {
    return {
      productStickyReplacesNav: false,
      setProductStickyReplacesNav: () => {},
    };
  }
  return ctx;
}
