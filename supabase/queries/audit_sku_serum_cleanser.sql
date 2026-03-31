-- =============================================================================
-- SKU: 세럼·클렌저·스큐(Sciu) 등 텍스트/유형 기준 점검
-- Supabase → SQL Editor 에 붙여 실행 (서비스 롤/대시보드는 RLS 우회)
-- =============================================================================

-- 1) 한글·영문 필드에 세럼 / 클렌저 / serum / cleanser / 스큐 / sciu 가 들어간 SKU 전부
select
  id,
  is_active,
  product_type,
  name,
  display_name,
  name_en,
  left(coalesce(memo, ''), 80) as memo_head
from public.sku_items
where
  name ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
  or coalesce(display_name, '') ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
  or coalesce(name_en, '') ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
  or coalesce(memo, '') ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
order by is_active desc, name;

-- 2) product_type 이 세럼·클렌저 로 저장된 SKU (이름에 안 써 있어도 잡힘)
select id, is_active, product_type, name, display_name, name_en
from public.sku_items
where product_type in ('세럼', '클렌저')
order by product_type, name;

-- 3) 위 SKU 들이 어떤 박스(product_components)에 붙어 있는지
select
  p.name as product_name,
  pc.product_id,
  pc.sort_order,
  pc.name as component_row_name,
  pc.sku_id,
  s.name as sku_name,
  s.is_active as sku_active
from public.product_components pc
join public.products p on p.id = pc.product_id
left join public.sku_items s on s.id = pc.sku_id
where pc.sku_id in (
  select id from public.sku_items
  where
    name ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
    or coalesce(display_name, '') ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
    or coalesce(name_en, '') ilike any (array['%세럼%', '%클렌저%', '%스큐%', '%serum%', '%cleanser%', '%sciu%'])
    or product_type in ('세럼', '클렌저')
)
order by p.name, pc.sort_order;

-- 4) 스큐만 좁혀 보기 (자주 쓰는 검색)
select id, is_active, product_type, name, display_name, name_en
from public.sku_items
where name ilike '%스큐%'
   or display_name ilike '%스큐%'
   or name_en ilike '%sciu%'
   or display_name ilike '%sciu%';
