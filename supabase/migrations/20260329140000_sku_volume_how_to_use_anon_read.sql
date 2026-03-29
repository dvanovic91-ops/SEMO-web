-- 고객용 구성품(SKU) 상세: 용량 표기 + 다국어 사용법
-- 비로그인 고객이 박스 구성품 상세를 볼 수 있도록 활성 SKU만 anon SELECT 허용

ALTER TABLE sku_items ADD COLUMN IF NOT EXISTS volume_label TEXT;
ALTER TABLE sku_items ADD COLUMN IF NOT EXISTS how_to_use TEXT;
ALTER TABLE sku_items ADD COLUMN IF NOT EXISTS how_to_use_en TEXT;
ALTER TABLE sku_items ADD COLUMN IF NOT EXISTS how_to_use_ru TEXT;

COMMENT ON COLUMN sku_items.volume_label IS '스토어 구성품 카드용 용량 (예: 50 ml, 30 g)';
COMMENT ON COLUMN sku_items.how_to_use IS '사용법 — 한국어(기본)';
COMMENT ON COLUMN sku_items.how_to_use_en IS '사용법 — English';
COMMENT ON COLUMN sku_items.how_to_use_ru IS '사용법 — русский';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sku_items'
      AND policyname = 'sku_items: anon read active storefront'
  ) THEN
    CREATE POLICY "sku_items: anon read active storefront"
      ON sku_items FOR SELECT TO anon
      USING (is_active = true);
  END IF;
END $$;
