-- Supabase 대시보드 → SQL Editor 에서 이 전체 블록 실행.
-- 1) profiles: auth.users 와 1:1, 이름/등급/포인트 (기본 0점, 테스트 완료 시 300점 등 이벤트별 지급)
-- 2) skin_test_results: 테스트 완료 시 300점 지급 트리거
-- 3) shipping_addresses, orders + RLS

-- profiles (가입 시 0점; 테스트 완료 300p, 연동 200p, 추천 200p, 리뷰 300p 등 이벤트별 지급)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  grade text default 'Обычный участник',
  points int default 0,
  telegram_id text unique,
  telegram_reward_given boolean default false,
  referred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "본인만 조회/수정"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auth 가입 시 profiles 한 행 자동 생성
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- skin_test_results: 테스트 완료 시 300점 지급 (테스트 완료 후 가입 300p)
create table if not exists public.skin_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skin_type text,
  completed_at timestamptz default now()
);

alter table public.skin_test_results enable row level security;

create policy "본인 테스트 결과만 조회"
  on public.skin_test_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 테스트 결과 저장 시 해당 유저에게 300점 지급
create or replace function public.grant_points_on_test_complete()
returns trigger as $$
begin
  update public.profiles set points = coalesce(points, 0) + 300, updated_at = now() where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_skin_test_complete on public.skin_test_results;
create trigger on_skin_test_complete
  after insert on public.skin_test_results
  for each row execute procedure public.grant_points_on_test_complete();

-- shipping_addresses
create table if not exists public.shipping_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_region text,
  street_house text,
  apartment_office text,
  postcode text,
  phone text,
  inn text,
  passport_series text,
  passport_number text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

alter table public.shipping_addresses enable row level security;

create policy "본인 배송지만 조회/수정"
  on public.shipping_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- orders (status: pending, paid, shipped, delivered, confirmed — confirmed = 구매 확정)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'pending',
  total_cents int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.orders enable row level security;

create policy "본인 주문만 조회"
  on public.orders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- telegram_users: 봇에서 테스트 완료한 유저 (봇이 여기 포인트 저장)
create table if not exists public.telegram_users (
  telegram_id text primary key,
  points int default 0,
  skin_type text,
  completed_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.telegram_users enable row level security;

-- 봇은 service_role 등으로 쓰고, 웹 anon은 읽기 제한만. 필요 시 봇 전용 정책 추가.
create policy "telegram_users 읽기 자신만"
  on public.telegram_users for select
  using (false);

-- link_tokens: 웹에서 "Telegram 연동" 시 발급, 봇이 이 토큰+telegram_id로 연동 완료
create table if not exists public.link_tokens (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

alter table public.link_tokens enable row level security;

create policy "본인 링크 토큰만 삽입/조회"
  on public.link_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 봇이 호출: 토큰 + telegram_id 로 웹 프로필과 텔레그램 연동, 포인트 병합 + 연동 200p (재연동 시 중복 지급 없음)
create or replace function public.link_telegram(p_token uuid, p_telegram_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_telegram_points int;
  v_reward_given boolean;
begin
  select user_id into v_user_id from link_tokens where token = p_token and expires_at > now();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_expired_token');
  end if;
  select coalesce(points, 0) into v_telegram_points from telegram_users where telegram_id = p_telegram_id;
  select coalesce(telegram_reward_given, false) into v_reward_given from profiles where id = v_user_id;
  update profiles
  set telegram_id = p_telegram_id,
      points = greatest(coalesce(points, 0), coalesce(v_telegram_points, 0))
          + case when not v_reward_given then 200 else 0 end,
      telegram_reward_given = (v_reward_given or true),
      updated_at = now()
  where id = v_user_id;
  delete from link_tokens where token = p_token;
  return jsonb_build_object('ok', true, 'points_added_200', not v_reward_given);
end;
$$;

-- 이미 위 스키마를 한 번 실행한 적이 있고, 기존에 points 기본값이 500이었다면
-- SQL Editor에서 아래만 따로 실행하면 됨 (기본 0으로 변경).
-- alter table public.profiles alter column points set default 0;
-- update public.profiles set points = 0;

-- 이미 profiles 테이블이 있는데 telegram_id가 없다면, 아래만 실행 (Telegram 연동용).
-- alter table public.profiles add column if not exists telegram_id text unique;
-- 포인트 정책 반영 시 기존 profiles에 컬럼 추가:
-- alter table public.profiles add column if not exists telegram_reward_given boolean default false;
-- alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;

-- 포인트 소멸 예정일 (Edge Function cron-point-expiry-notify 에서 사용)
-- alter table public.profiles add column if not exists points_expires_at timestamptz;

-- 피부 타입별 추천 상품 (테스트 결과 → 추천 매칭용)
-- create table if not exists public.skin_type_products (
--   skin_type text not null,
--   product_id text not null,
--   sort_order int default 0,
--   primary key (skin_type, product_id)
-- );
-- alter table public.skin_type_products enable row level security;
-- create policy "추천 상품 읽기" on public.skin_type_products for select using (true);

-- ========== 포인트 정책: 추천 200p, 리뷰 300p (이벤트별 지급 규칙은 docs/POINTS_POLICY.md 참고) ==========

-- 추천인 코드 (유저별 고유 코드로 친구 초대 링크 생성)
create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz default now()
);

alter table public.referral_codes enable row level security;
create policy "본인 추천 코드만 조회" on public.referral_codes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 추천 보상 지급 이력 (추천인별·피추천인별 1회만 200p)
create table if not exists public.referral_rewards (
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (referrer_id, referred_id),
  constraint no_self_referral check (referrer_id != referred_id)
);

alter table public.referral_rewards enable row level security;
create policy "referral_rewards 서버 전용" on public.referral_rewards for select using (false);

-- 피추천인이 가입 완료 후 호출: 추천인에게 200p 지급 (계정별 1회). 프론트에서 ?ref=CODE 로 들어온 유저가 가입 후 이 RPC 호출.
create or replace function public.set_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer_id uuid;
  v_referred_id uuid;
begin
  v_referred_id := auth.uid();
  if v_referred_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  select user_id into v_referrer_id from referral_codes where code = p_code;
  if v_referrer_id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if v_referrer_id = v_referred_id then
    return jsonb_build_object('ok', false, 'error', 'cannot_refer_self');
  end if;
  update profiles set referred_by = v_referrer_id, updated_at = now() where id = v_referred_id;
  insert into referral_rewards (referrer_id, referred_id) values (v_referrer_id, v_referred_id)
  on conflict (referrer_id, referred_id) do nothing;
  if FOUND then
    update profiles set points = coalesce(points, 0) + 200, updated_at = now() where id = v_referrer_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- 리뷰 (구매 확정된 주문에 대해 작성 가능, 작성 시 300p 1회 지급)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  rating int not null check (rating >= 1 and rating <= 5),
  body text,
  created_at timestamptz default now(),
  unique(user_id, order_id)
);

alter table public.reviews enable row level security;
create policy "본인 리뷰만 조회/삽입" on public.reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 리뷰 보상 1회만 (user_id, order_id 당 300p 1회)
create table if not exists public.review_rewards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, order_id)
);

alter table public.review_rewards enable row level security;
create policy "review_rewards 서버 전용" on public.review_rewards for select using (false);

-- 리뷰 삽입 시: 구매 확정된 본인 주문만 허용, 300p 1회 지급
create or replace function public.grant_points_on_review()
returns trigger as $$
declare
  v_order_ok boolean;
begin
  select exists(
    select 1 from orders o where o.id = new.order_id and o.user_id = new.user_id and o.status = 'confirmed'
  ) into v_order_ok;
  if not v_order_ok then
    raise exception 'review_only_confirmed_order';
  end if;
  insert into review_rewards (user_id, order_id) values (new.user_id, new.order_id)
  on conflict (user_id, order_id) do nothing;
  if FOUND then
    update public.profiles set points = coalesce(points, 0) + 300, updated_at = now() where id = new.user_id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_review_created on public.reviews;
create trigger on_review_created
  after insert on public.reviews
  for each row execute procedure public.grant_points_on_review();
