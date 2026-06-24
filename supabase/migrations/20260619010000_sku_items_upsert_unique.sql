-- SKU 일괄 등록 upsert 지원: (brand, name) 조합 유니크 제약
-- 같은 브랜드 + 같은 영문SKU명이면 동일 제품으로 판단해 덮어씀
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sku_items_brand_name_unique'
  ) THEN
    ALTER TABLE public.sku_items
      ADD CONSTRAINT sku_items_brand_name_unique UNIQUE (brand, name);
  END IF;
END $$;
