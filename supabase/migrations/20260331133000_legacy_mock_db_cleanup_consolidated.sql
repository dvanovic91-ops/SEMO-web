-- =============================================================================
-- 레거시 내부 목업 DB 정리 (통합, 멱등에 가깝게)
-- 프론트·봇 상수: 웹사이트/src/lib/legacyMockContent.ts
-- 이미 20260330220000 / 20260330230000 을 실행한 프로젝트도 재실행해도 대부분 0행.
--
-- 적용 전 점검(선택): 아래 SELECT 만 주석 해제해 실행.
--   select id, name, display_name from public.sku_items
--     where name ilike '%nihuya%' or display_name ilike '%nihuya%';
--   select id, product_id, name from public.product_components where name ilike '%nihuya%';
-- =============================================================================

-- 1) products: 알려진 한국어 한 줄 목업만 제거 (다른 설명은 건드리지 않음)
update public.products
set description = nullif(
  trim(replace(replace(description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', '')),
  ''
)
where description is not null
  and (description like '%돈좀 많이 벌게해주세요%' or description like '%돈 좀 많이 벌게 해주세요%');

update public.products
set detail_description = nullif(
  trim(replace(replace(detail_description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', '')),
  ''
)
where detail_description is not null
  and (detail_description like '%돈좀 많이 벌게해주세요%' or detail_description like '%돈 좀 많이 벌게 해주세요%');

-- 2) 슬롯 description 동일 문구
update public.catalog_room_slots
set description = nullif(
  trim(replace(replace(description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', '')),
  ''
)
where description is not null
  and (description like '%돈좀 많이 벌게해주세요%' or description like '%돈 좀 많이 벌게 해주세요%');

update public.main_layout_slots
set description = nullif(
  trim(replace(replace(description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', '')),
  ''
)
where description is not null
  and (description like '%돈좀 많이 벌게해주세요%' or description like '%돈 좀 많이 벌게 해주세요%');

-- 3) 박스 구성 연결만 끊음 (sku_items 마스터는 유지 — 관리자에서 정리 가능)
delete from public.product_components
where lower(coalesce(trim(name), '')) like '%nihuya%'
   or lower(coalesce(trim(name), '')) like '%perfect serum foring%';

delete from public.product_components pc
using public.sku_items s
where pc.sku_id is not null
  and pc.sku_id = s.id
  and (
    lower(coalesce(trim(s.name), '')) like '%nihuya%'
    or lower(coalesce(trim(s.display_name), '')) like '%nihuya%'
  );

-- 4) sku_items 표시명: 맨 앞 Nihuya/니후야 목업 접두어만 제거 (실제 브랜드가 동일 접두면 수동 확인)
update public.sku_items
set display_name = nullif(
  trim(regexp_replace(display_name, '^[Nn]ihuya[^:]*:\s*', '', 'n')),
  ''
)
where display_name is not null
  and display_name ~* '^nihuya[^:]*:';

update public.sku_items
set display_name = nullif(trim(regexp_replace(display_name, '^[Nn]ihuya\s*-\s*', '', 'ni')), '')
where display_name is not null
  and display_name ~* '^nihuya\s*-';

update public.sku_items
set name = nullif(trim(regexp_replace(name, '^[Nn]ihuya[^:]*:\s*', '', 'n')), '')
where name is not null
  and name ~* '^nihuya[^:]*:';

update public.sku_items
set name = nullif(trim(regexp_replace(name, '^[Nn]ihuya\s*-\s*', '', 'ni')), '')
where name is not null
  and name ~* '^nihuya\s*-';

-- 5) 영문 설명에 남은 알려진 오타 목업만 제거
update public.sku_items
set description = nullif(trim(replace(description, 'Perfect serum foring', '')), '')
where description is not null and description like '%Perfect serum foring%';

update public.sku_items
set description_en = nullif(trim(replace(description_en, 'Perfect serum foring', '')), '')
where description_en is not null and description_en like '%Perfect serum foring%';

update public.sku_items
set description_ru = nullif(trim(replace(description_ru, 'Perfect serum foring', '')), '')
where description_ru is not null and description_ru like '%Perfect serum foring%';
