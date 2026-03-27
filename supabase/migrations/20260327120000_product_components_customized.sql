-- product_components 테이블에 커스터마이징 제품 여부 컬럼 추가
-- is_customized = true → 이 피부 타입에만 특별히 들어가는 맞춤 제품
-- is_customized = false (기본값) → 모든 박스에 공통으로 들어가는 제품

ALTER TABLE product_components
  ADD COLUMN IF NOT EXISTS is_customized BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN product_components.is_customized IS
  '커스터마이징 제품 여부: true = 이 피부 타입 전용 맞춤 제품, false = 공용 제품';
