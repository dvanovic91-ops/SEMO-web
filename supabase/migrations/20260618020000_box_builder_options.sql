-- box_builder_options: Build Your Box slot choices (max 3 per slot by sort_order)
CREATE TABLE IF NOT EXISTS public.box_builder_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot TEXT NOT NULL CHECK (slot IN ('cleanser', 'toner', 'serum', 'ampoule', 'cream', 'sunscreen')),
  sort_order INT NOT NULL DEFAULT 0,
  brand TEXT NOT NULL DEFAULT '',
  name_ru TEXT NOT NULL DEFAULT '',
  name_en TEXT NOT NULL DEFAULT '',
  tag_ru TEXT NOT NULL DEFAULT '',
  tag_en TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  sku_id UUID REFERENCES public.sku_items (id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS box_builder_options_slot_sort_idx
  ON public.box_builder_options (slot, sort_order);

ALTER TABLE public.box_builder_options ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "box_builder_options read active" ON public.box_builder_options;
CREATE POLICY "box_builder_options read active"
  ON public.box_builder_options FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "box_builder_options admin all" ON public.box_builder_options;
CREATE POLICY "box_builder_options admin all"
  ON public.box_builder_options FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Admin: read all rows including inactive
DROP POLICY IF EXISTS "box_builder_options admin read all" ON public.box_builder_options;
CREATE POLICY "box_builder_options admin read all"
  ON public.box_builder_options FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
