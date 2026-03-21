-- membership_coupons.tier 에 'special' 추가 (관리자 특별 쿠폰, 앱에서 만료 14일)
-- 기존 DB에 이미 적용된 경우 constraint 이름이 다를 수 있음 → 오류 시 아래 "이름 확인" 쿼리로 조정

-- 이름 확인 (선택):
-- select conname from pg_constraint where conrelid = 'public.membership_coupons'::regclass;

alter table public.membership_coupons drop constraint if exists membership_coupons_tier_check;

alter table public.membership_coupons
  add constraint membership_coupons_tier_check
  check (tier in ('basic', 'premium', 'family', 'special'));

comment on column public.membership_coupons.tier is
  'basic/premium/family: 분기 멤버십 쿠폰. special: 관리자 특별 지급(유효기간 앱에서 14일).';
