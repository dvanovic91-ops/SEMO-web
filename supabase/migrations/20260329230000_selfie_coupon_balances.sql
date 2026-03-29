-- 셀카(정밀) 분석 쿠폰 잔액 — 회원별 1행, 관리자 지급·앱에서 차감(RPC)

create table if not exists public.selfie_coupon_balances (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists selfie_coupon_balances_updated_at_idx
  on public.selfie_coupon_balances (updated_at desc);

comment on table public.selfie_coupon_balances is '셀카 기반 피부 분석 쿠폰 잔액(관리자 지급·소비)';

-- 기존 전 회원 +1장 (이미 행이 있으면 잔액 +1)
insert into public.selfie_coupon_balances (user_id, balance, updated_at)
select id, 1, now()
from auth.users
on conflict (user_id) do update set
  balance = public.selfie_coupon_balances.balance + excluded.balance,
  updated_at = now();

-- 신규 가입 시 기본 1장 (이미 마이그레이션 등으로 행이 있으면 스킵)
create or replace function public.handle_new_user_selfie_coupon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.selfie_coupon_balances (user_id, balance)
  values (new.id, 1)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_selfie_coupon on auth.users;
create trigger on_auth_user_created_selfie_coupon
  after insert on auth.users
  for each row
  execute function public.handle_new_user_selfie_coupon();

-- 로그인 사용자: 본인 잔액 조회 / 관리자: 전체 조회(회원 목록)
alter table public.selfie_coupon_balances enable row level security;

drop policy if exists "selfie_coupon_balances_select_own" on public.selfie_coupon_balances;
drop policy if exists "selfie_coupon_balances_select_admin" on public.selfie_coupon_balances;

create policy "selfie_coupon_balances_select_own"
  on public.selfie_coupon_balances
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "selfie_coupon_balances_select_admin"
  on public.selfie_coupon_balances
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_admin, false) = true
    )
  );

grant select on table public.selfie_coupon_balances to authenticated;

-- 분석 성공 시 1장 차감 (RLS 우회)
create or replace function public.consume_selfie_coupon()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nb int;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'balance', 0, 'reason', 'no_session');
  end if;

  insert into public.selfie_coupon_balances (user_id, balance, updated_at)
  values (auth.uid(), 0, now())
  on conflict (user_id) do nothing;

  update public.selfie_coupon_balances
  set balance = balance - 1, updated_at = now()
  where user_id = auth.uid() and balance > 0
  returning balance into nb;

  if found then
    return jsonb_build_object('ok', true, 'balance', nb);
  end if;

  select balance into nb from public.selfie_coupon_balances where user_id = auth.uid();
  return jsonb_build_object('ok', false, 'balance', coalesce(nb, 0));
end;
$$;

-- 관리자만 타인에게 지급 (delta >= 1)
create or replace function public.admin_grant_selfie_coupons(target_user_id uuid, delta integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  nb int;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and coalesce(is_admin, false) = true
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if target_user_id is null or delta is null or delta < 1 then
    raise exception 'invalid_args';
  end if;

  insert into public.selfie_coupon_balances (user_id, balance, updated_at)
  values (target_user_id, delta, now())
  on conflict (user_id) do update set
    balance = public.selfie_coupon_balances.balance + delta,
    updated_at = now()
  returning balance into nb;

  return jsonb_build_object('ok', true, 'balance', nb);
end;
$$;

grant execute on function public.consume_selfie_coupon() to authenticated;
grant execute on function public.admin_grant_selfie_coupons(uuid, integer) to authenticated;
