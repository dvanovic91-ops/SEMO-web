-- Storefront 구성품 상세: 비로그인 사용자도 ingredient_library 설명(역할) 조회 가능
DO $$ BEGIN
  CREATE POLICY "ingredient_library: anon read"
    ON ingredient_library FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
