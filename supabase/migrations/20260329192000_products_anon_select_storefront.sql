-- 쇼핑몰·카탈로그: 비로그인(anon)이 상품 행을 읽을 수 있어야 슬롯에 연결된 박스가 노출됨.
-- is_active = false 인 상품만 제외 (coalesce: NULL 이면 노출)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'products'
      AND policyname = 'products: anon read active storefront'
  ) THEN
    CREATE POLICY "products: anon read active storefront"
      ON public.products FOR SELECT TO anon
      USING (coalesce(is_active, true) = true);
  END IF;
END $$;
