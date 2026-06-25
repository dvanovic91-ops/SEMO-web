-- 박스 빌더 태그: 「Восстановление кожи」→「Восстановление」(카드 한 줄 표시)
UPDATE public.sku_items
SET box_builder_tag_ru = REPLACE(box_builder_tag_ru, 'Восстановление кожи', 'Восстановление')
WHERE box_builder_tag_ru LIKE '%Восстановление кожи%';

UPDATE public.box_builder_options
SET
  tag_ru = REPLACE(tag_ru, 'Восстановление кожи', 'Восстановление'),
  updated_at = now()
WHERE tag_ru LIKE '%Восстановление кожи%';
