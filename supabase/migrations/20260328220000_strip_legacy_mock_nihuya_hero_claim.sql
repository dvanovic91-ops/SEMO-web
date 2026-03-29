-- Remove legacy mock product prefix (e.g. "니후야 퍼펙트 세럼:") from __claim__ rows in key_ingredients_desc.
-- Safe to re-run: pattern only strips a leading "니후야…:" or "Nihuya…:" prefix.

UPDATE sku_items u
SET key_ingredients_desc = (
  SELECT COALESCE(
    jsonb_agg(
      CASE
        WHEN e->>'name' = '__claim__' THEN
          jsonb_build_object(
            'name', '__claim__',
            'ko', trim(regexp_replace(COALESCE(e->>'ko', ''), '^니후야[^:]*:\s*', '', 'n')),
            'en', trim(regexp_replace(COALESCE(e->>'en', ''), '^Nihuya[^:]*:\s*', '', 'ni')),
            'ru', trim(regexp_replace(COALESCE(e->>'ru', ''), '^Nihuya[^:]*:\s*', '', 'ni'))
          )
        ELSE e
      END
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(u.key_ingredients_desc) WITH ORDINALITY AS t(e, ord)
)
WHERE u.key_ingredients_desc IS NOT NULL
  AND u.key_ingredients_desc::text LIKE '%니후야%';
