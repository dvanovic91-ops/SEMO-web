-- Box builder: assign SKUs from inventory (상품 & 재고 관리)
ALTER TABLE public.sku_items
  ADD COLUMN IF NOT EXISTS box_builder_slot TEXT CHECK (
    box_builder_slot IS NULL
    OR box_builder_slot IN ('cleanser', 'toner', 'serum', 'ampoule', 'cream', 'sunscreen')
  ),
  ADD COLUMN IF NOT EXISTS box_builder_sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS box_builder_tag_ru TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS box_builder_tag_en TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS sku_items_box_builder_slot_idx
  ON public.sku_items (box_builder_slot, box_builder_sort_order)
  WHERE box_builder_slot IS NOT NULL;
