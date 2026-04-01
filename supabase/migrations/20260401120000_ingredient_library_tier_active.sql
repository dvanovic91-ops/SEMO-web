-- 기획/매칭: 저농도 유효 액티브 등 순서 가중 보정 여부 (관리자가 성분 사전에서 토글)
ALTER TABLE ingredient_library
  ADD COLUMN IF NOT EXISTS tier_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN ingredient_library.tier_active IS
  'True면 전성분 순서가 뒤에 있어도 점수 계산 시 앞쪽 성분처럼 가중 보정(티어 액티브).';
