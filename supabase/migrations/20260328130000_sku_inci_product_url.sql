-- INCI Decoder에서 관리자가 선택한 제품 페이지 고정 URL (성분 수집 정확도)
ALTER TABLE sku_items
  ADD COLUMN IF NOT EXISTS inci_product_url TEXT;

COMMENT ON COLUMN sku_items.inci_product_url IS '관리자 검색으로 선택한 incidecoder.com 제품 페이지 전체 URL';
