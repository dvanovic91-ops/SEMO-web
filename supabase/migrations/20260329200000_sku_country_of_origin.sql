-- 스토어 구성품 상세: 원산지/생산지 (예: Made in Korea)
ALTER TABLE public.sku_items ADD COLUMN IF NOT EXISTS country_of_origin TEXT;

COMMENT ON COLUMN public.sku_items.country_of_origin IS '스토어 구성품 상세 — 생산지/원산지 표기 (비우면 기본: Made in Korea / Сделано в Корее)';
