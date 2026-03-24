-- 피부 타입별 추천 슬롯 매칭 (관리자에서 드래그로 설정, 앱에서 이 테이블 우선 사용)
-- 슬롯 1~5 = 뷰티 Shop 상품 1~5 (catalog_room_slots, catalog_room=beauty, slot_index 0~4)

create table if not exists public.skin_type_slot_mapping (
  skin_type text primary key,
  slot_index smallint not null check (slot_index >= 1 and slot_index <= 5)
);

comment on table public.skin_type_slot_mapping is '피부테스트 결과( skin_type ) → 추천 슬롯 번호( 1~5 ). 관리자 화면에서 편집.';

-- RLS: 읽기는 anon/authenticated 모두, 쓰기는 authenticated만 (관리자는 앱에서 is_admin 체크)
alter table public.skin_type_slot_mapping enable row level security;

create policy "Allow read for all"
  on public.skin_type_slot_mapping for select
  using (true);

create policy "Allow insert for authenticated"
  on public.skin_type_slot_mapping for insert
  with check (auth.role() = 'authenticated');

create policy "Allow update for authenticated"
  on public.skin_type_slot_mapping for update
  using (auth.role() = 'authenticated');

create policy "Allow delete for authenticated"
  on public.skin_type_slot_mapping for delete
  using (auth.role() = 'authenticated');

-- 시드: config 기본값과 동일 (DRNT·DSNW→1, OSNW·ORNT→2, 나머지 1)
insert into public.skin_type_slot_mapping (skin_type, slot_index)
values
  ('DRNT', 1), ('DSNW', 1), ('OSNW', 2), ('ORNT', 2),
  ('DSPW', 1), ('DSPT', 1), ('DSNT', 1), ('DRPW', 1), ('DRPT', 1), ('DRNW', 1),
  ('OSPW', 1), ('OSPT', 1), ('OSNT', 1), ('ORPW', 1), ('ORPT', 1), ('ORNW', 1)
on conflict (skin_type) do update set slot_index = excluded.slot_index;
