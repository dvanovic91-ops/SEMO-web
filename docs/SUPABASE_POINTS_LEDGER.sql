-- =============================================================================
-- 포인트 원장(points_ledger) 도입
-- 목적: 포인트 적립/차감을 전부 이벤트 단위로 기록하여 추적 가능하게 만들기
-- 실행 위치: Supabase SQL Editor
-- =============================================================================

create table if not exists public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  delta_points int not null, -- +적립 / -차감 (단위: pt)
  reason text not null,      -- 예: review_reward, order_points_used, skin_test_bonus, telegram_link_bonus
  source_table text,
  source_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.points_ledger is '포인트 적립/차감 이벤트 원장';
comment on column public.points_ledger.delta_points is '포인트 증감(단위 pt). 음수는 차감';
comment on column public.points_ledger.reason is '적립/차감 사유 코드';

create index if not exists idx_points_ledger_user_created_at
  on public.points_ledger(user_id, created_at desc);

-- 같은 원천(source_table/source_id/reason) 이벤트 중복 기록 방지
create unique index if not exists uq_points_ledger_source
  on public.points_ledger(user_id, reason, source_table, source_id)
  where source_id is not null;

alter table public.points_ledger enable row level security;

-- 본인 + 관리자/매니저 조회 허용
drop policy if exists "points_ledger_select_own_or_admin" on public.points_ledger;
create policy "points_ledger_select_own_or_admin"
  on public.points_ledger
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.current_user_is_admin_or_manager()
  );

-- 직접 insert/update/delete는 금지하고, 아래 RPC를 통해서만 처리 권장
drop policy if exists "points_ledger_insert_admin_only" on public.points_ledger;
create policy "points_ledger_insert_admin_only"
  on public.points_ledger
  for insert
  to authenticated
  with check (public.current_user_is_admin());

drop policy if exists "points_ledger_update_admin_only" on public.points_ledger;
create policy "points_ledger_update_admin_only"
  on public.points_ledger
  for update
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "points_ledger_delete_admin_only" on public.points_ledger;
create policy "points_ledger_delete_admin_only"
  on public.points_ledger
  for delete
  to authenticated
  using (public.current_user_is_admin());

-- -----------------------------------------------------------------------------
-- 포인트 증감 + profiles.points 동기화 RPC (원자 처리)
-- -----------------------------------------------------------------------------
create or replace function public.apply_points_delta(
  p_user_id uuid,
  p_delta_points int,
  p_reason text,
  p_source_table text default null,
  p_source_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_current_points int;
begin
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;
  if p_delta_points = 0 then
    return;
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'p_reason is required';
  end if;

  select public.current_user_is_admin() into v_is_admin;
  if auth.uid() is distinct from p_user_id and not coalesce(v_is_admin, false) then
    raise exception 'permission denied';
  end if;

  select coalesce(points, 0) into v_current_points
  from public.profiles
  where id = p_user_id
  for update;

  if p_delta_points < 0 and (v_current_points + p_delta_points) < 0 then
    raise exception 'insufficient points';
  end if;

  update public.profiles
  set points = greatest(0, coalesce(points, 0) + p_delta_points),
      updated_at = now()
  where id = p_user_id;

  insert into public.points_ledger (user_id, delta_points, reason, source_table, source_id, metadata)
  values (p_user_id, p_delta_points, p_reason, p_source_table, p_source_id, coalesce(p_metadata, '{}'::jsonb))
  on conflict (user_id, reason, source_table, source_id)
  do nothing;
end;
$$;

comment on function public.apply_points_delta(uuid, int, text, text, uuid, jsonb) is
  'profiles.points와 points_ledger를 원자적으로 동기화하는 포인트 증감 함수';

