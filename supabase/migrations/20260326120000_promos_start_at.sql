-- 프로모 기간 시작일(선택) — 공개 /promo 및 관리자에서 종료일과 함께 표시
alter table public.promos add column if not exists start_at timestamptz null;

comment on column public.promos.start_at is 'Optional promotion period start; paired with end_at on site (ru: дд.мм.гггг — дд.мм.гггг)';
