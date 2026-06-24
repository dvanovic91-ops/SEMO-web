-- Premium slot for box builder (Премиум)
ALTER TABLE public.sku_items DROP CONSTRAINT IF EXISTS sku_items_box_builder_slot_check;

ALTER TABLE public.sku_items
  ADD CONSTRAINT sku_items_box_builder_slot_check CHECK (
    box_builder_slot IS NULL
    OR box_builder_slot IN (
      'cleanser', 'toner', 'serum', 'ampoule', 'cream', 'sunscreen', 'premium'
    )
  );
