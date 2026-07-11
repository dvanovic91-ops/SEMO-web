-- ============================================================
-- 1. products 테이블에 weight_g 컬럼 추가
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight_g integer;

-- 제품별 무게 데이터 입력 (name 기준으로 매칭)
UPDATE products SET weight_g = 90  WHERE name ILIKE '%NAD Prizcell%' OR name ILIKE '%Prizcell Serum%';
UPDATE products SET weight_g = 110 WHERE name ILIKE '%PDRN Caffeine%';
UPDATE products SET weight_g = 180 WHERE name ILIKE '%Aqua Rice Cleanser%';
UPDATE products SET weight_g = 170 WHERE name ILIKE '%INTECA Cleansing%';
UPDATE products SET weight_g = 220 WHERE name ILIKE '%Tea Tree Cleansing Foam%';
UPDATE products SET weight_g = 105 WHERE name ILIKE '%Aqua Oasis Gel%';
UPDATE products SET weight_g = 85  WHERE name ILIKE '%Aqua Squalane%';
UPDATE products SET weight_g = 75  WHERE name ILIKE '%Pore Perfecting%';
UPDATE products SET weight_g = 105 WHERE name ILIKE '%Ceramide Skin Barrier%';
UPDATE products SET weight_g = 45  WHERE name ILIKE '%Eye Cream%';
UPDATE products SET weight_g = 125 WHERE name ILIKE '%Cleansing Balm%';
UPDATE products SET weight_g = 90  WHERE name ILIKE '%Bakuchiol Serum%';
UPDATE products SET weight_g = 110 WHERE name ILIKE '%Mela Spot%';
UPDATE products SET weight_g = 50  WHERE name ILIKE '%Vitamin C Ampoule%';
UPDATE products SET weight_g = 70  WHERE name ILIKE '%Mineral Sunscreen%';
UPDATE products SET weight_g = 31  WHERE name ILIKE '%Birch Sun Stick%';
UPDATE products SET weight_g = 60  WHERE name ILIKE '%Mela Tranex%';
UPDATE products SET weight_g = 70  WHERE name ILIKE '%Pink Tone Up%';
UPDATE products SET weight_g = 250 WHERE name ILIKE '%Chestnut BHA%';
UPDATE products SET weight_g = 250 WHERE name ILIKE '%Panthetoin Essence%';
UPDATE products SET weight_g = 300 WHERE name ILIKE '%PDRN Pink Cica%';

-- ============================================================
-- 2. 신규 가입 시 웰컴 쿠폰 500루블 자동 발급 트리거
-- ============================================================
-- membership_coupons 테이블에 'welcome' tier가 없으면 추가 필요
-- (기존 tier CHECK 제약이 있으면 아래 ALTER로 추가)
-- ALTER TABLE membership_coupons DROP CONSTRAINT IF EXISTS membership_coupons_tier_check;
-- ALTER TABLE membership_coupons ADD CONSTRAINT membership_coupons_tier_check
--   CHECK (tier IN ('bronze','silver','gold','special','gift_box','selfie','welcome'));

CREATE OR REPLACE FUNCTION give_welcome_coupon()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO membership_coupons (user_id, amount, tier, expires_at)
  VALUES (
    NEW.id,
    500,
    'special',
    NOW() + INTERVAL '90 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_welcome_coupon ON profiles;
CREATE TRIGGER trg_welcome_coupon
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION give_welcome_coupon();

-- ============================================================
-- 3. 30일 후 리뷰 포인트 200P 자동 지급을 위한 컬럼 추가
-- ============================================================
-- order_feedbacks 테이블에 30일 리뷰 추적 컬럼 추가
ALTER TABLE order_feedbacks ADD COLUMN IF NOT EXISTS followup_reward_at timestamptz;
ALTER TABLE order_feedbacks ADD COLUMN IF NOT EXISTS followup_rewarded boolean DEFAULT false;
