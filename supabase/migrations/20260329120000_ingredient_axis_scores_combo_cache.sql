-- 성분 라이브러리: 5축 점수(D,O,S,P,W) + 시너지/충돌 + 농도 노트
-- (avoid_skin_types 는 수동 추가된 경우가 있어 IF NOT EXISTS)
ALTER TABLE ingredient_library
  ADD COLUMN IF NOT EXISTS avoid_skin_types text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS axis_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS synergy_with text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS conflict_with text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS concentration_note text;

-- 박스(다중 SKU) 성분 조합 → Gemini 분석 결과 캐시
CREATE TABLE IF NOT EXISTS combo_cache (
  cache_key          text PRIMARY KEY,
  ingredient_keys    text[] NOT NULL,
  axis_scores        jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings           text[] NOT NULL DEFAULT '{}'::text[],
  synergies          text[] NOT NULL DEFAULT '{}'::text[],
  recommended_for    text[] NOT NULL DEFAULT '{}'::text[],
  gemini_summary     text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_combo_cache_created ON combo_cache (created_at DESC);

ALTER TABLE combo_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "combo_cache: authenticated read"
    ON combo_cache FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "combo_cache: admin write"
    ON combo_cache FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
