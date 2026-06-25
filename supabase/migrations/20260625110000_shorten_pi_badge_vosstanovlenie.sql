-- 박스 빌더 카드 태그는 pi_profile.badges.ru 가 box_builder_tag_ru 보다 우선함
UPDATE public.sku_items
SET pi_profile = jsonb_set(
  pi_profile,
  '{badges,ru}',
  (
    SELECT COALESCE(
      jsonb_agg(
        to_jsonb(
          CASE
            WHEN value = 'Восстановление кожи' THEN 'Восстановление'
            ELSE value
          END
        )
      ),
      '[]'::jsonb
    )
    FROM jsonb_array_elements_text(pi_profile->'badges'->'ru') AS t(value)
  )
)
WHERE pi_profile->'badges'->'ru' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(pi_profile->'badges'->'ru') AS t(value)
    WHERE value = 'Восстановление кожи'
  );
