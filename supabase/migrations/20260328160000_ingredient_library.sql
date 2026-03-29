-- 전역 성분 캐시: INCI 정규키 단위로 태그·설명을 쌓아 다음 제품 파싱 시 재사용
CREATE TABLE IF NOT EXISTS ingredient_library (
  inci_key         TEXT PRIMARY KEY,
  name_en          TEXT,
  benefit_tags     JSONB NOT NULL DEFAULT '[]'::jsonb,
  description_ko   TEXT,
  description_en   TEXT,
  description_ru   TEXT,
  source           TEXT DEFAULT 'sku_sync',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingredient_library_updated
  ON ingredient_library (updated_at DESC);

CREATE OR REPLACE FUNCTION update_ingredient_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ingredient_library_updated ON ingredient_library;
CREATE TRIGGER trg_ingredient_library_updated
  BEFORE UPDATE ON ingredient_library
  FOR EACH ROW EXECUTE FUNCTION update_ingredient_library_updated_at();

ALTER TABLE ingredient_library ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ingredient_library: authenticated read"
    ON ingredient_library FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "ingredient_library: admin write"
    ON ingredient_library FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
