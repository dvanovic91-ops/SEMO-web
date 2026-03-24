-- =============================================================================
-- 카탈로그 슬롯 단일 테이블: catalog_room_slots
-- (catalog_room, slot_index) 유니크 — 쿼리 시 항상 .eq('catalog_room', 'beauty' | …)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.catalog_room_slots (
  id SERIAL PRIMARY KEY,
  catalog_room TEXT NOT NULL CHECK (catalog_room IN ('beauty', 'inner_beauty', 'hair_beauty')),
  slot_index SMALLINT NOT NULL CHECK (slot_index >= 0 AND slot_index <= 4),
  title TEXT,
  description TEXT,
  image_url TEXT,
  product_id UUID REFERENCES public.products (id) ON DELETE SET NULL,
  link_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT catalog_room_slots_room_slot_unique UNIQUE (catalog_room, slot_index)
);

CREATE INDEX IF NOT EXISTS catalog_room_slots_room_idx ON public.catalog_room_slots (catalog_room);
CREATE INDEX IF NOT EXISTS catalog_room_slots_product_id_idx ON public.catalog_room_slots (product_id);

ALTER TABLE public.catalog_room_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_room_slots read all" ON public.catalog_room_slots;
CREATE POLICY "catalog_room_slots read all"
  ON public.catalog_room_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS "catalog_room_slots admin all" ON public.catalog_room_slots;
CREATE POLICY "catalog_room_slots admin all"
  ON public.catalog_room_slots FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ---------- main_layout_slots → 이관 (테이블이 있을 때) ----------
INSERT INTO public.catalog_room_slots (catalog_room, slot_index, title, description, image_url, product_id, link_url)
SELECT DISTINCT ON (slot_index)
  'beauty'::text,
  slot_index,
  title,
  description,
  image_url,
  product_id,
  link_url
FROM public.main_layout_slots
WHERE COALESCE(NULLIF(TRIM(category), ''), 'beauty') = 'beauty'
ORDER BY slot_index, id DESC
ON CONFLICT (catalog_room, slot_index) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  product_id = EXCLUDED.product_id,
  link_url = EXCLUDED.link_url,
  updated_at = now();

INSERT INTO public.catalog_room_slots (catalog_room, slot_index, title, description, image_url, product_id, link_url)
SELECT DISTINCT ON (slot_index)
  'inner_beauty'::text,
  slot_index,
  title,
  description,
  image_url,
  product_id,
  link_url
FROM public.main_layout_slots
WHERE TRIM(category) = 'inner_beauty'
ORDER BY slot_index, id DESC
ON CONFLICT (catalog_room, slot_index) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  product_id = EXCLUDED.product_id,
  link_url = EXCLUDED.link_url,
  updated_at = now();

INSERT INTO public.catalog_room_slots (catalog_room, slot_index, title, description, image_url, product_id, link_url)
SELECT DISTINCT ON (slot_index)
  'hair_beauty'::text,
  slot_index,
  title,
  description,
  image_url,
  product_id,
  link_url
FROM public.main_layout_slots
WHERE TRIM(category) = 'hair_beauty'
ORDER BY slot_index, id DESC
ON CONFLICT (catalog_room, slot_index) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url,
  product_id = EXCLUDED.product_id,
  link_url = EXCLUDED.link_url,
  updated_at = now();

-- RPC 갱신: docs/SUPABASE_RPC_SKIN_RECOMMEND_PRODUCT.sql (catalog_room = 'beauty')
