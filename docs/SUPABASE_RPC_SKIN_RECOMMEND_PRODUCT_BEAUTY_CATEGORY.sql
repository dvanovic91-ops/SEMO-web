-- 피부 테스트 추천: catalog_room_slots 중 catalog_room = 'beauty'
-- 기존 get_recommended_product_id_for_skin_type 함수가 있다면 이 정의로 교체하세요.

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
