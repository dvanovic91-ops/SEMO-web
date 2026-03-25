-- ============================================================
-- SKU 재고 관리 시스템 마이그레이션
-- 2026-03-26
-- ============================================================

-- 1) sku_items: 재고 단위(SKU) 마스터
CREATE TABLE IF NOT EXISTS sku_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                          -- SKU 이름 (예: "라운드랩 자작나무 클렌저")
  image_url   TEXT,                                   -- 대표 이미지
  current_stock INTEGER NOT NULL DEFAULT 0,           -- 현재 재고 수량
  safety_stock  INTEGER NOT NULL DEFAULT 0,           -- 안전재고 (이하 경고)
  unit        TEXT NOT NULL DEFAULT 'ea',             -- 단위 (ea, ml, g 등)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,          -- 비활성화 시 드롭다운에서 숨김
  memo        TEXT,                                   -- 관리 메모
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) stock_transactions: 입출고/조정 이력
CREATE TABLE IF NOT EXISTS stock_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_id      UUID NOT NULL REFERENCES sku_items(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('inbound', 'outbound', 'adjust')),
  qty         INTEGER NOT NULL,                       -- 입고: +양수, 출고/조정: -음수
  memo        TEXT,                                   -- "3월 입고", "주문#1234", "파손 2개" 등
  order_id    UUID,                                   -- 출고 시 연결되는 주문 ID (nullable)
  created_by  UUID,                                   -- 등록한 관리자 ID
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) product_components에 sku_id 컬럼 추가 (기존 데이터 영향 없음)
ALTER TABLE product_components
  ADD COLUMN IF NOT EXISTS sku_id UUID REFERENCES sku_items(id) ON DELETE SET NULL;

-- 4) 인덱스
CREATE INDEX IF NOT EXISTS idx_stock_tx_sku      ON stock_transactions(sku_id);
CREATE INDEX IF NOT EXISTS idx_stock_tx_created   ON stock_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_tx_order     ON stock_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_sku_items_active   ON sku_items(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_prod_comp_sku      ON product_components(sku_id) WHERE sku_id IS NOT NULL;

-- 5) updated_at 자동 갱신 트리거 (sku_items)
CREATE OR REPLACE FUNCTION update_sku_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sku_updated_at ON sku_items;
CREATE TRIGGER trg_sku_updated_at
  BEFORE UPDATE ON sku_items
  FOR EACH ROW EXECUTE FUNCTION update_sku_updated_at();

-- 6) 입출고 시 current_stock 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_sku_stock_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE sku_items SET current_stock = current_stock + NEW.qty WHERE id = NEW.sku_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE sku_items SET current_stock = current_stock - OLD.qty WHERE id = OLD.sku_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_tx_sync ON stock_transactions;
CREATE TRIGGER trg_stock_tx_sync
  AFTER INSERT OR DELETE ON stock_transactions
  FOR EACH ROW EXECUTE FUNCTION update_sku_stock_on_transaction();

-- 7) RLS 정책
ALTER TABLE sku_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions ENABLE ROW LEVEL SECURITY;

-- sku_items: 인증된 사용자 읽기 가능 (프론트에서 재고 확인용)
DO $$ BEGIN
  CREATE POLICY "sku_items: authenticated read"
    ON sku_items FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- sku_items: 관리자만 쓰기
DO $$ BEGIN
  CREATE POLICY "sku_items: admin write"
    ON sku_items FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- stock_transactions: 관리자만 읽기/쓰기
DO $$ BEGIN
  CREATE POLICY "stock_tx: admin all"
    ON stock_transactions FOR ALL TO authenticated
    USING (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    )
    WITH CHECK (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 완료! 이 SQL을 Supabase SQL Editor에서 실행하세요.
-- ============================================================
