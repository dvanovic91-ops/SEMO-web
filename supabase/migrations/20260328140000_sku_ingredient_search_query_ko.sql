-- 관리자 모달: ① 검색란(브랜드+상품 한 줄) 초안 보존 — 재오픈 시 그대로 표시
ALTER TABLE sku_items
  ADD COLUMN IF NOT EXISTS ingredient_search_query_ko TEXT;
