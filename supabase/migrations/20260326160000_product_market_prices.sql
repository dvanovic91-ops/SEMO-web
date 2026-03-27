-- product_market_prices: 상품별 통화 가격 테이블
CREATE TABLE IF NOT EXISTS product_market_prices (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  currency TEXT NOT NULL,
  rrp_price NUMERIC(12, 2),
  prp_price NUMERIC(12, 2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, currency)
);

-- RLS 활성화
ALTER TABLE product_market_prices ENABLE ROW LEVEL SECURITY;

-- 누구나 읽기 가능 (쇼핑몰 가격 표시)
CREATE POLICY "product_market_prices: public read"
  ON product_market_prices FOR SELECT USING (true);

-- 관리자만 쓰기
CREATE POLICY "product_market_prices: admin insert"
  ON product_market_prices FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "product_market_prices: admin update"
  ON product_market_prices FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "product_market_prices: admin delete"
  ON product_market_prices FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_product_market_prices_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_market_prices_updated_at ON product_market_prices;
CREATE TRIGGER trg_product_market_prices_updated_at
  BEFORE UPDATE ON product_market_prices
  FOR EACH ROW EXECUTE FUNCTION update_product_market_prices_updated_at();
