-- 뷰티 등 카탈로그 슬롯 최대 7칸(인덱스 0~6)
alter table public.catalog_room_slots drop constraint if exists catalog_room_slots_slot_index_check;
alter table public.catalog_room_slots
  add constraint catalog_room_slots_slot_index_check check (slot_index >= 0 and slot_index <= 6);

-- 히스토리 시즌 버킷(N-1~N-3): 1=최신(페이지 상단), 3=가장 과거(페이지 하단)
alter table public.products add column if not exists history_season_index smallint;
alter table public.products add column if not exists history_order int not null default 0;

comment on column public.products.history_season_index is 'box_history 시 N-1=1, N-2=2, N-3=3';
comment on column public.products.history_order is '같은 시즌 버킷 내 정렬(작을수록 앞)';

alter table public.products drop constraint if exists products_history_season_index_check;
alter table public.products
  add constraint products_history_season_index_check
  check (history_season_index is null or (history_season_index >= 1 and history_season_index <= 3));
