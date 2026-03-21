-- =============================================================================
-- 공지 기간 + 이력(announcement_broadcasts) — 기존 notifications에 컬럼 추가 후 RPC 교체
-- 이미 SUPABASE_NOTIFICATIONS.sql 을 실행한 뒤 이 파일을 한 번 실행하세요.
-- 유형(discount 등)·이동 화면(link_to)은 notifications.metadata 에도 복사됩니다.
-- =============================================================================

create table if not exists public.announcement_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  visible_from timestamptz not null,
  visible_until timestamptz not null,
  recipient_count bigint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.announcement_broadcasts
  add column if not exists category text,
  add column if not exists link_to text;

comment on table public.announcement_broadcasts is '관리자 전체 공지 이력. 삭제 시 user notifications 행 CASCADE';
comment on column public.announcement_broadcasts.category is 'discount | new_product | event | general | shipping | other';
comment on column public.announcement_broadcasts.link_to is 'promo | shop | profile | points | orders | skin-test | support | home | journey | about';

alter table public.announcement_broadcasts enable row level security;

drop policy if exists "announcement_broadcasts_admin_all" on public.announcement_broadcasts;
create policy "announcement_broadcasts_admin_all"
  on public.announcement_broadcasts for all
  to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_admin, false) = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and coalesce(p.is_admin, false) = true)
  );

alter table public.notifications
  add column if not exists broadcast_id uuid,
  add column if not exists visible_from timestamptz,
  add column if not exists visible_until timestamptz;

-- FK (기존 행 broadcast_id null 허용)
alter table public.notifications drop constraint if exists notifications_broadcast_id_fkey;
alter table public.notifications
  add constraint notifications_broadcast_id_fkey
  foreign key (broadcast_id) references public.announcement_broadcasts(id) on delete cascade;

create index if not exists idx_notifications_broadcast_id on public.notifications (broadcast_id);

-- 기존 RPC 제거 후 6인자(유형·이동) + metadata
drop function if exists public.admin_broadcast_notifications(text, text);
drop function if exists public.admin_broadcast_notifications(text, text, timestamptz, timestamptz);

create or replace function public.admin_broadcast_notifications(
  p_title text,
  p_body text,
  p_visible_from timestamptz,
  p_visible_until timestamptz,
  p_category text,
  p_link_to text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  c bigint;
  v_cat text;
  v_link text;
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

  if p_visible_from is null or p_visible_until is null then
    raise exception 'visible range required';
  end if;

  if p_visible_until < p_visible_from then
    raise exception 'visible_until must be >= visible_from';
  end if;

  v_cat := coalesce(nullif(trim(p_category), ''), 'general');
  v_link := coalesce(nullif(trim(p_link_to), ''), 'promo');

  insert into public.announcement_broadcasts (title, body, visible_from, visible_until, created_by, category, link_to)
  values (trim(p_title), nullif(trim(p_body), ''), p_visible_from, p_visible_until, auth.uid(), v_cat, v_link)
  returning id into v_id;

  insert into public.notifications (user_id, title, body, kind, broadcast_id, visible_from, visible_until, metadata)
  select
    id,
    trim(p_title),
    coalesce(trim(p_body), ''),
    'admin',
    v_id,
    p_visible_from,
    p_visible_until,
    jsonb_build_object('announcement_category', v_cat, 'link_to', v_link)
  from public.profiles;

  get diagnostics c = row_count;

  update public.announcement_broadcasts
  set recipient_count = c
  where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_broadcast_notifications(text, text, timestamptz, timestamptz, text, text) from public;
grant execute on function public.admin_broadcast_notifications(text, text, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.admin_delete_broadcast(p_broadcast_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and coalesce(is_admin, false) = true
  ) then
    raise exception 'forbidden: admin only';
  end if;

  if p_broadcast_id is null then
    raise exception 'id required';
  end if;

  delete from public.announcement_broadcasts where id = p_broadcast_id;
end;
$$;

revoke all on function public.admin_delete_broadcast(uuid) from public;
grant execute on function public.admin_delete_broadcast(uuid) to authenticated;
