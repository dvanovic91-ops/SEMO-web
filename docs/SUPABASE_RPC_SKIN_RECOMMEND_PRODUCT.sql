-- Beauty Box — 피부 타입 → 추천 product_id (웹 Recommendations.tsx + 봇 공통)
-- Supabase SQL Editor에서 실행 후, 봇은 supabase_helper.get_recommended_product_id_for_skin_type 가 RPC 우선 호출.
--
-- 규칙 (웹 src/lib/skinTypeSlotMapping.ts + src/config/skinTypeRecommendations.ts 와 동일):
-- 1) skin_type_slot_mapping 에 행이 있으면 slot_index 사용
-- 2) 없으면 아래 CASE (SKIN_TYPE_SLOT_INDEX) — 운영에서는 매핑을 DB에만 두면 CASE는 사용되지 않음
-- 3) catalog_room_slots 중 catalog_room = 'beauty' 를 slot_index 오름차순으로 정렬한 뒤 N번째 행(1-based)의 product_id

CREATE OR REPLACE FUNCTION public.get_recommended_product_id_for_skin_type(p_skin_type text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := upper(trim(coalesce(p_skin_type, '')));
  v_slot int;
  v_pid uuid;
BEGIN
  IF v_norm = '' THEN
    RETURN NULL;
  END IF;

  SELECT m.slot_index INTO v_slot
  FROM public.skin_type_slot_mapping m
  WHERE m.skin_type = v_norm
  LIMIT 1;

  IF v_slot IS NULL THEN
    v_slot := CASE v_norm
      WHEN 'DRNT' THEN 1
      WHEN 'DSNW' THEN 1
      WHEN 'OSNW' THEN 2
      WHEN 'ORNT' THEN 2
      WHEN 'DSPW' THEN 1
      WHEN 'DSPT' THEN 1
      WHEN 'DSNT' THEN 1
      WHEN 'DRPW' THEN 1
      WHEN 'DRPT' THEN 1
      WHEN 'DRNW' THEN 1
      WHEN 'OSPW' THEN 1
      WHEN 'OSPT' THEN 1
      WHEN 'OSNT' THEN 1
      WHEN 'ORPW' THEN 1
      WHEN 'ORPT' THEN 1
      WHEN 'ORNW' THEN 1
      ELSE NULL
    END;
  END IF;

  IF v_slot IS NULL OR v_slot < 1 OR v_slot > 5 THEN
    RETURN NULL;
  END IF;

  SELECT x.product_id INTO v_pid
  FROM (
    SELECT
      mls.product_id,
      row_number() OVER (ORDER BY mls.slot_index ASC) AS rn
    FROM public.catalog_room_slots mls
    WHERE mls.catalog_room = 'beauty'
  ) x
  WHERE x.rn = v_slot
  LIMIT 1;

  RETURN v_pid;
END;
$$;

COMMENT ON FUNCTION public.get_recommended_product_id_for_skin_type(text) IS
  '피부 타입 → 추천 상품 UUID. 웹 Recommendations / 텔레그램 봇 공통. 매핑은 skin_type_slot_mapping 우선.';

-- 봇(service_role) + (선택) 웹 anon 이 RPC 호출 가능하도록
GRANT EXECUTE ON FUNCTION public.get_recommended_product_id_for_skin_type(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recommended_product_id_for_skin_type(text) TO anon, authenticated;
