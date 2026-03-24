-- 프로모: 진행 중 / 아카이브(종료) 구분 — 공개 /promo 탭 및 관리자에서 사용
alter table public.promos add column if not exists is_archived boolean not null default false;

comment on column public.promos.is_archived is 'false: Актуальные; true: Архив (завершённые)';
