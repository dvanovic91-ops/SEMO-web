-- ══════════════════════════════════════════════════════════════
-- SEMO Security Hardening — 2개 보안 패치
-- Supabase SQL Editor에서 전체 실행
-- ══════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────
-- FIX 1: 결제 금액 서버 검증 DB Trigger
-- 클라이언트에서 finalAmount를 조작해도 DB에서 차단
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION validate_order_amount()
RETURNS TRIGGER AS $$
DECLARE
  item_rec         jsonb;
  snapshot_total   numeric := 0;
  item_price       numeric;
  item_qty         int;
BEGIN
  -- ① total_cents 음수 방지
  IF NEW.total_cents < 0 THEN
    RAISE EXCEPTION 'SECURITY: Order total cannot be negative (got %)', NEW.total_cents;
  END IF;

  -- ② snapshot_items 기반 상한선 검증
  --    (snapshot_items가 없는 absoluteMinimal 페이로드는 건너뜀)
  IF NEW.snapshot_items IS NOT NULL
     AND jsonb_typeof(NEW.snapshot_items) = 'array'
     AND jsonb_array_length(NEW.snapshot_items) > 0
  THEN
    FOR item_rec IN SELECT * FROM jsonb_array_elements(NEW.snapshot_items)
    LOOP
      item_price := COALESCE((item_rec->>'price')::numeric, 0);
      item_qty   := COALESCE((item_rec->>'quantity')::int,  1);

      -- 개별 상품 가격도 음수 불가
      IF item_price < 0 THEN
        RAISE EXCEPTION 'SECURITY: Item price cannot be negative';
      END IF;

      snapshot_total := snapshot_total + (item_price * item_qty);
    END LOOP;

    -- total_cents는 snapshot 합계(원 단위)를 초과할 수 없음
    -- (할인으로 줄어드는 건 허용, 부풀리는 건 차단)
    IF NEW.total_cents > ROUND(snapshot_total * 100) THEN
      RAISE EXCEPTION
        'SECURITY: Order total (% cents) exceeds snapshot total (% cents)',
        NEW.total_cents,
        ROUND(snapshot_total * 100);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 기존 트리거가 있으면 교체
DROP TRIGGER IF EXISTS trg_validate_order_amount ON orders;

CREATE TRIGGER trg_validate_order_amount
  BEFORE INSERT ON orders
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_amount();


-- ──────────────────────────────────────────────────────────────
-- FIX 5: membership_coupons RLS 강화
-- 쿠폰 재사용 및 used_at 조작 방지
-- ──────────────────────────────────────────────────────────────

-- RLS 활성화 확인 (이미 켜져있으면 에러 없이 무시됨)
ALTER TABLE membership_coupons ENABLE ROW LEVEL SECURITY;

-- 기존 정책 제거 후 재생성
DROP POLICY IF EXISTS "Users can view own coupons"          ON membership_coupons;
DROP POLICY IF EXISTS "Users can insert own coupons"        ON membership_coupons;
DROP POLICY IF EXISTS "Users can mark own coupons as used"  ON membership_coupons;

-- SELECT: 본인 쿠폰만 조회 가능
CREATE POLICY "Users can view own coupons"
  ON membership_coupons
  FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: 관리자/서버만 발급 가능 (일반 유저는 직접 생성 불가)
-- 프론트에서 INSERT하는 곳이 없으므로 차단
CREATE POLICY "Only service role can insert coupons"
  ON membership_coupons
  FOR INSERT
  WITH CHECK (false); -- anon/authenticated 유저는 INSERT 불가, service_role은 RLS 우회

-- UPDATE: 본인의 미사용 쿠폰만, used_at을 null→timestamp로만 변경 가능
--   USING  → "어떤 행을 UPDATE할 수 있나": 본인 것 + 아직 안 쓴 것만
--   WITH CHECK → "UPDATE 후 상태": used_at이 반드시 NOT NULL (null로 되돌리기 불가)
CREATE POLICY "Users can mark own coupons as used"
  ON membership_coupons
  FOR UPDATE
  USING  (auth.uid() = user_id AND used_at IS NULL)
  WITH CHECK (used_at IS NOT NULL);

-- DELETE: 아무도 삭제 불가 (감사 추적 보존)
DROP POLICY IF EXISTS "No delete on coupons" ON membership_coupons;
CREATE POLICY "No delete on coupons"
  ON membership_coupons
  FOR DELETE
  USING (false);


-- ──────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 확인용)
-- ──────────────────────────────────────────────────────────────

-- 트리거 확인
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'orders'::regclass
  AND tgname = 'trg_validate_order_amount';

-- RLS 정책 확인
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'membership_coupons';
