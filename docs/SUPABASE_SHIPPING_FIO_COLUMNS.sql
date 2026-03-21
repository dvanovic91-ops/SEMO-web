-- Beauty Box — shipping_addresses에 ФИО(라틴) 컬럼 추가 (프로필·결제 폼을 DB에 upsert 하기 위함)
-- Supabase SQL Editor에서 한 번 실행.
-- 컬럼이 없으면 프론트 upsert(`fio_*` 포함)가 실패할 수 있음.
-- 참고: 동일 구문이 docs/SUPABASE_FULL_SCHEMA.sql 및 SUPABASE_SCHEMA.sql 에도 포함되어 있음(신규 배포 시 중복 실행 무방).

alter table public.shipping_addresses add column if not exists fio_last text;
alter table public.shipping_addresses add column if not exists fio_first text;
alter table public.shipping_addresses add column if not exists fio_middle text;

comment on column public.shipping_addresses.fio_last is 'Фамилия (латиница), как в паспорте';
comment on column public.shipping_addresses.fio_first is 'Имя';
comment on column public.shipping_addresses.fio_middle is 'Отчество (может быть пустым)';
