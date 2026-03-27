-- ============================================================
--  SKU 성분 분석 컬럼 추가
--  2026-03-27
-- ============================================================

ALTER TABLE sku_items
  ADD COLUMN IF NOT EXISTS brand              TEXT,
  ADD COLUMN IF NOT EXISTS name_en            TEXT,        -- 영문 제품명 (성분 검색용)
  ADD COLUMN IF NOT EXISTS key_ingredients    TEXT,        -- 핵심 성분 Top3 (콤마 구분)
  ADD COLUMN IF NOT EXISTS key_ingredients_desc JSONB,    -- [{name, ko, en, ru}] 마케팅 문구
  ADD COLUMN IF NOT EXISTS description_en     TEXT,        -- 영문 제품 설명 (상세페이지용)
  ADD COLUMN IF NOT EXISTS description_ru     TEXT,        -- 러시아어 제품 설명 (상세페이지용)
  ADD COLUMN IF NOT EXISTS ingredients_raw   TEXT,        -- 원본 전성분 문자열
  ADD COLUMN IF NOT EXISTS ingredients_json  JSONB,       -- 파싱된 성분 배열 [{name, benefit_tags, concern_level}]
  ADD COLUMN IF NOT EXISTS ingredients_status TEXT
      NOT NULL DEFAULT 'pending'
      CHECK (ingredients_status IN ('pending','fetching','done','failed')),
  ADD COLUMN IF NOT EXISTS ingredients_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ingredients_source     TEXT;   -- 출처 URL

-- 관리자가 빠르게 성분 미완료 항목 조회
CREATE INDEX IF NOT EXISTS idx_sku_ingredients_status
  ON sku_items(ingredients_status)
  WHERE ingredients_status <> 'done';

-- ============================================================
-- 완료! Supabase SQL Editor에서 실행하세요.
-- ============================================================
