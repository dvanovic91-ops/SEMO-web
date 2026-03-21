-- =============================================================================
-- Beauty Box — 사용자 알림 (notifications) + 주문/포인트 트리거 + 관리자 전체 공지 RPC
-- Supabase SQL Editor에서 한 번 실행. (중복 실행 가능: IF NOT EXISTS / OR REPLACE)
-- Realtime: 실행 후 Table Editor에서 notifications → Realtime 켜거나 아래 publication 추가.
--
-- 공지 노출 기간·이력·삭제는 별도 마이그레이션: docs/SUPABASE_ANNOUNCEMENT_BROADCASTS.sql
-- (실행 후 admin_broadcast_notifications 시그니처가 바뀌므로 반드시 순서 지킬 것)
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text,
  kind text not null default 'system',
  read_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_created
  on public.notifications (user_id, created_at desc);

create index if not exists idx_notifications_user_unread
  on public.notifications (user_id)
  where read_at is null;

comment on table public.notifications is '사용자 알림: 주문·배송·포인트·관리자 공지';
comment on column public.notifications.kind is 'order_status | points | admin | system';

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own"
  on public.notifications for delete
  to authenticated
  using (auth.uid() = user_id);

-- 일반 사용자 INSERT 불가 (트리거·RPC만)

-- ---------------------------------------------------------------------------
-- 내부용: 알림 1건 삽입 (트리거에서만 호출)
-- ---------------------------------------------------------------------------
create or replace function public.notify_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_kind text default 'system',
  p_metadata jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, title, body, kind, metadata)
  values (p_user_id, p_title, coalesce(p_body, ''), coalesce(nullif(trim(p_kind), ''), 'system'), coalesce(p_metadata, '{}'));
end;
$$;

-- ---------------------------------------------------------------------------
-- 주문 상태 변경 시 알림 (INSERT·UPDATE of status)
-- ---------------------------------------------------------------------------
create or replace function public.trg_orders_notify_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_order_label text;
begin
  v_uid := coalesce(new.user_id, old.user_id);
  if v_uid is null then
    return new;
  end if;

  -- 고객 노출 번호(orders.order_number)와 동일: 없으면 UUID 앞 8자(마이페이지·체크아웃 폴백과 일치)
  v_order_label := coalesce(nullif(trim(new.order_number::text), ''), left(new.id::text, 8));

  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      perform public.notify_user(v_uid, 'Заказ оплачен',
        'Заказ №' || v_order_label || ' успешно оформлен.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'pending' then
      perform public.notify_user(v_uid, 'Заказ создан',
        'Заказ №' || v_order_label || ' ожидает оплаты.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and (old.status is distinct from new.status) then
    if new.status = 'completed' and old.status is distinct from 'completed' then
      perform public.notify_user(v_uid, 'Заказ оплачен',
        'Заказ №' || v_order_label || ' оплачен.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'shipping_soon' then
      perform public.notify_user(v_uid, 'Заказ готовится к отправке',
        'Заказ №' || v_order_label || ' готовится к отправке.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'shipped' then
      perform public.notify_user(v_uid, 'Заказ отправлен',
        'Заказ №' || v_order_label || ' передан в доставку.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'delivered' then
      perform public.notify_user(v_uid, 'Заказ доставлен',
        'Заказ №' || v_order_label || ' доставлен.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'confirmed' then
      perform public.notify_user(v_uid, 'Заказ подтверждён',
        'Заказ №' || v_order_label || ' подтверждён.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'refunded' then
      perform public.notify_user(v_uid, 'Возврат по заказу',
        'По заказу №' || v_order_label || ' оформлен возврат.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    elsif new.status = 'canceled' then
      perform public.notify_user(v_uid, 'Заказ отменён',
        'Заказ №' || v_order_label || ' отменён.', 'order_status',
        jsonb_build_object('order_id', new.id, 'status', new.status));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_notify_status on public.orders;
create trigger trg_orders_notify_status
  after insert or update of status on public.orders
  for each row
  execute function public.trg_orders_notify_status();

-- ---------------------------------------------------------------------------
-- 포인트 적립(원장) 시 알림 — 테이블이 있을 때만
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'points_ledger'
  ) then
    create or replace function public.trg_points_ledger_notify()
    returns trigger
    language plpgsql
    security definer
    set search_path = public
    as $fn$
    begin
      if new.delta_points > 0 then
        perform public.notify_user(
          new.user_id,
          'Начислены баллы',
          '+' || new.delta_points::text || ' баллов. Причина: ' || coalesce(new.reason, '—'),
          'points',
          jsonb_build_object('reason', new.reason, 'delta', new.delta_points)
        );
      end if;
      return new;
    end;
    $fn$;

    drop trigger if exists trg_points_ledger_notify on public.points_ledger;
    create trigger trg_points_ledger_notify
      after insert on public.points_ledger
      for each row
      execute function public.trg_points_ledger_notify();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 관리자: 전체 회원에게 공지 (제목·본문)
-- ---------------------------------------------------------------------------
create or replace function public.admin_broadcast_notifications(p_title text, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  c bigint;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and coalesce(is_admin, false) = true
  ) then
    raise exception 'forbidden: admin only';
  end if;

  if coalesce(trim(p_title), '') = '' then
    raise exception 'title required';
  end if;

  insert into public.notifications (user_id, title, body, kind)
  select id, trim(p_title), coalesce(trim(p_body), ''), 'admin'
  from public.profiles;

  get diagnostics c = row_count;
  return c;
end;
$$;

revoke all on function public.admin_broadcast_notifications(text, text) from public;
grant execute on function public.admin_broadcast_notifications(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (선택): 대시보드에서 켜도 되고, 여기서 publication 추가
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

alter table public.notifications replica identity full;
