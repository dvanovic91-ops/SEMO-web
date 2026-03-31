-- 선택 실행: Nihuya 목업 구성 행 제거
-- 통합본: 20260331133000_legacy_mock_db_cleanup_consolidated.sql

delete from public.product_components
where lower(coalesce(name, '')) like '%nihuya%';

delete from public.product_components pc
using public.sku_items s
where pc.sku_id is not null
  and pc.sku_id = s.id
  and (
    lower(coalesce(s.name, '')) like '%nihuya%'
    or lower(coalesce(s.display_name, '')) like '%nihuya%'
  );
