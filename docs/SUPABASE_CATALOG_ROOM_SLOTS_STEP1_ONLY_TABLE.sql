-- 슬롯 저장이 안 될 때: 이 파일만 먼저 Supabase SQL Editor에서 실행하세요.
-- (main_layout_slots 없어도 됨. 아래 실행 후 관리자에서 「슬롯 순서 저장」 다시 시도)

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
