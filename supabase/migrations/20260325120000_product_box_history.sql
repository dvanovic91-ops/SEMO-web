-- 뷰티박스 과거 시즌: 메인 /shop 에서 숨기고 «История боксов» 페이지에만 노출
alter table public.products
  add column if not exists box_history boolean not null default false;

comment on column public.products.box_history is 'Beauty box: past season — hidden from main shop, shown on /shop/box-history';
