-- 내부 목업 문구만 제거 (다른 한글 설명은 건드리지 않음)
-- 통합본: 20260331133000_legacy_mock_db_cleanup_consolidated.sql (새 프로젝트는 통합본만 써도 됨)

update public.products
set description = trim(replace(replace(description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', ''))
where description is not null
  and (description like '%돈좀 많이 벌게해주세요%' or description like '%돈 좀 많이 벌게 해주세요%');

update public.products
set detail_description = trim(replace(replace(detail_description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', ''))
where detail_description is not null
  and (detail_description like '%돈좀 많이 벌게해주세요%' or detail_description like '%돈 좀 많이 벌게 해주세요%');

update public.catalog_room_slots
set description = trim(replace(replace(description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', ''))
where description is not null
  and (description like '%돈좀 많이 벌게해주세요%' or description like '%돈 좀 많이 벌게 해주세요%');

update public.main_layout_slots
set description = trim(replace(replace(description, '돈좀 많이 벌게해주세요', ''), '돈 좀 많이 벌게 해주세요', ''))
where description is not null
  and (description like '%돈좀 많이 벌게해주세요%' or description like '%돈 좀 많이 벌게 해주세요%');
