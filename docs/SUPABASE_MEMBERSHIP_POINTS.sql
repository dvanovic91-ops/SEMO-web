-- 회원 등급별 분기 **쿠폰** 지급 로직 (포인트 대신 쿠폰으로 관리)
-- Supabase SQL Editor에서 실행

-- 1) 멤버십 쿠폰 테이블: 분기마다 1장씩, 3개월 유효
create table if not exists public.membership_coupons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount int not null,                 -- 100 / 200 / 300 (루블)
  tier text not null check (tier in ('basic', 'premium', 'family', 'special')),
  quarter_label text not null,         -- 예: 2026Q2
  created_at timestamptz default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  order_id uuid references public.orders(id)
);

comment on table public.membership_coupons is '분기별 멤버십 쿠폰 (100/200/300 루블 할인, 3개월 유효).';

create unique index if not exists membership_coupons_user_quarter_key
  on public.membership_coupons(user_id, quarter_label);

alter table public.membership_coupons enable row level security;

-- 본인만 쿠폰 조회·업데이트(사용) 가능. INSERT는 관리자만 사용 (웹 Admin 버튼 → RPC 호출)
drop policy if exists "membership_coupons_select_own" on public.membership_coupons;
create policy "membership_coupons_select_own"
  on public.membership_coupons for select
  using (auth.uid() = user_id);

drop policy if exists "membership_coupons_update_own" on public.membership_coupons;
create policy "membership_coupons_update_own"
  on public.membership_coupons for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin( profiles.is_admin = true )만 분기 쿠폰 INSERT 가능
drop policy if exists "membership_coupons_insert_admin" on public.membership_coupons;
create policy "membership_coupons_insert_admin"
  on public.membership_coupons for insert
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_admin, false) = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and coalesce(p.is_admin, false) = true
    )
  );

-- 2) 누적 주문 금액(배송완료·구매확정만 포함, 테스트 주문 제외)을 기준으로 등급 계산
--    basic: < 35 000 ₽, premium: 35 000~99 999 ₽, family: >= 100 000 ₽
create or replace function public.get_membership_tier(p_user_id uuid)
returns text
language plpgsql
as $$
declare
  v_sum_cents bigint := 0;
  v_sum_rub numeric;
begin
  select coalesce(sum(total_cents), 0)
    into v_sum_cents
  from public.orders
  where user_id = p_user_id
    and status in ('delivered', 'confirmed')
    and coalesce(is_test, false) = false;

  v_sum_rub := v_sum_cents / 100.0;

  if v_sum_rub >= 100000 then
    return 'family';
  elsif v_sum_rub >= 35000 then
    return 'premium';
  else
    return 'basic';
  end if;
end;
$$;

comment on function public.get_membership_tier(uuid) is
  '회원 등급: basic / premium / family. 배송완료·구매확정 주문 누계(테스트 주문 제외) 기반.';

-- 3) 한 분기(3개월)에 한 번 실행할 멤버십 **쿠폰** 지급 함수
--    basic: 100, premium: 200, family: 300 (루블), 모두 90일 후 소멸. 분기당 1장만 생성.
create or replace function public.grant_membership_coupons_for_quarter()
returns void
language plpgsql
as $$
declare
  r record;
  v_tier text;
  v_amount int;
  v_now timestamptz := now();
  v_year int := extract(year from v_now);
  v_month int := extract(month from v_now);
  v_quarter int;
  v_quarter_label text;
begin
  if v_month between 1 and 3 then
    v_quarter := 1;
  elsif v_month between 4 and 6 then
    v_quarter := 2;
  elsif v_month between 7 and 9 then
    v_quarter := 3;
  else
    v_quarter := 4;
  end if;

  v_quarter_label := format('%sQ%s', v_year, v_quarter);

  for r in
    select id
    from public.profiles
    where id is not null
  loop
    v_tier := public.get_membership_tier(r.id);

    if v_tier = 'family' then
      v_amount := 300;
    elsif v_tier = 'premium' then
      v_amount := 200;
    else
      v_amount := 100;
    end if;

    insert into public.membership_coupons (user_id, amount, tier, quarter_label, expires_at)
    values (r.id, v_amount, v_tier, v_quarter_label, v_now + interval '90 days')
    on conflict (user_id, quarter_label) do nothing;
  end loop;
end;
$$;

comment on function public.grant_membership_coupons_for_quarter() is
  '모든 회원에게 등급별 분기 쿠폰(basic 100 / premium 200 / family 300 루블)을 1장씩 지급하고, 90일 후 만료되도록 expires_at를 설정. 분기당 1장만 생성.';

-- 4) 특정 회원들만 선택해서 분기 쿠폰 지급: Admin 웹에서 체크박스 선택 후 RPC 호출용
--    (한 명씩 호출하는 버전. 클라이언트에서 여러 명 선택 시 여러 번 호출)
create or replace function public.grant_membership_coupon_for_user(p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_tier text;
  v_amount int;
  v_now timestamptz := now();
  v_year int := extract(year from v_now);
  v_month int := extract(month from v_now);
  v_quarter int;
  v_quarter_label text;
begin
  if v_month between 1 and 3 then
    v_quarter := 1;
  elsif v_month between 4 and 6 then
    v_quarter := 2;
  elsif v_month between 7 and 9 then
    v_quarter := 3;
  else
    v_quarter := 4;
  end if;

  v_quarter_label := format('%sQ%s', v_year, v_quarter);

  -- 회원 등급 계산
  v_tier := public.get_membership_tier(p_user_id);

  if v_tier = 'family' then
    v_amount := 300;
  elsif v_tier = 'premium' then
    v_amount := 200;
  else
    v_amount := 100;
  end if;

  insert into public.membership_coupons (user_id, amount, tier, quarter_label, expires_at)
  values (p_user_id, v_amount, v_tier, v_quarter_label, v_now + interval '90 days')
  on conflict (user_id, quarter_label) do nothing;
end;
$$;

comment on function public.grant_membership_coupon_for_user(uuid) is
  '특정 회원 1명에게만 분기 멤버십 쿠폰을 지급합니다. Admin 웹에서 선택한 회원만 지급할 때 사용 (분기·등급·금액 로직은 grant_membership_coupons_for_quarter와 동일).';

