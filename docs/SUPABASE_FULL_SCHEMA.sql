-- =============================================================================
-- Beauty Box — Supabase 전체 스키마 (SQL Editor에서 이 파일 전체 실행)
-- =============================================================================
-- 1) profiles: auth.users 1:1, 이름/등급/포인트(기본 0), 테스트 완료 시 500점
-- 2) skin_test_results: 테스트 완료 시 500점 지급 트리거
-- 3) shipping_addresses, orders + RLS
-- 4) telegram_users, link_tokens, link_telegram (연동 시 200p)
-- 5) products, main_layout_slots (관리자 페이지용)
-- 6) 추천/리뷰 보상 (선택)
-- =============================================================================

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  grade text default 'Обычный участник',
  points int default 0,
  phone text,
  phone_verified boolean default false,
  is_admin boolean default false,
  telegram_id text unique,
  telegram_reward_given boolean default false,
  referred_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- 이미 profiles 테이블이 예전 스키마로 있을 때 누락된 컬럼 추가
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists phone_verified boolean default false;
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists telegram_reward_given boolean default false;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists telegram_id text;

drop policy if exists "본인만 조회/수정" on public.profiles;
create policy "본인만 조회/수정"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auth 가입 시 profiles 한 행 자동 생성 (닉네임은 raw_user_meta_data->>'nickname' 또는 email 앞부분)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'nickname',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- skin_test_results: 테스트 완료 시 500점 지급 ----------
create table if not exists public.skin_test_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skin_type text,
  completed_at timestamptz default now()
);

alter table public.skin_test_results enable row level security;

drop policy if exists "본인 테스트 결과만 조회" on public.skin_test_results;
create policy "본인 테스트 결과만 조회"
  on public.skin_test_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.grant_points_on_test_complete()
returns trigger as $$
begin
  update public.profiles set points = 500, updated_at = now() where id = new.user_id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_skin_test_complete on public.skin_test_results;
create trigger on_skin_test_complete
  after insert on public.skin_test_results
  for each row execute procedure public.grant_points_on_test_complete();

-- ---------- shipping_addresses ----------
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

drop policy if exists "본인 배송지만 조회/수정" on public.shipping_addresses;
create policy "본인 배송지만 조회/수정"
  on public.shipping_addresses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text default 'pending',
  total_cents int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.orders enable row level security;

drop policy if exists "본인 주문만 조회" on public.orders;
create policy "본인 주문만 조회"
  on public.orders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- telegram_users (봇 전용) ----------
create table if not exists public.telegram_users (
  telegram_id text primary key,
  points int default 0,
  skin_type text,
  completed_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.telegram_users enable row level security;

drop policy if exists "telegram_users 읽기 자신만" on public.telegram_users;
create policy "telegram_users 읽기 자신만"
  on public.telegram_users for select
  using (false);

-- ---------- link_tokens (웹 → Telegram 연동) ----------
create table if not exists public.link_tokens (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '15 minutes')
);

alter table public.link_tokens enable row level security;

drop policy if exists "본인 링크 토큰만 삽입/조회" on public.link_tokens;
create policy "본인 링크 토큰만 삽입/조회"
  on public.link_tokens for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 봇 호출: 토큰 + telegram_id 로 연동, 포인트 병합 + 연동 200p (재연동 시 중복 지급 없음)
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
      phone_verified = true,
      telegram_reward_given = (v_reward_given or true),
      updated_at = now()
  where id = v_user_id;
  delete from link_tokens where token = p_token;
  return jsonb_build_object('ok', true, 'points_added_200', not v_reward_given);
end;
$$;

-- ---------- products (관리자 상품 관리) ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  category text,
  image_url text,
  rrp_price numeric(10,2),
  prp_price numeric(10,2),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.products enable row level security;

drop policy if exists "상품 읽기 모두 허용" on public.products;
create policy "상품 읽기 모두 허용"
  on public.products for select using (true);

drop policy if exists "상품 쓰기 관리자만" on public.products;
create policy "상품 쓰기 관리자만"
  on public.products for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- ---------- main_layout_slots (메인 페이지 슬롯, 관리자만 쓰기) ----------
create table if not exists public.main_layout_slots (
  id serial primary key,
  slot_index smallint not null,
  title text,
  description text,
  image_url text,
  product_id uuid references public.products(id) on delete set null,
  link_url text,
  updated_at timestamptz default now()
);

alter table public.main_layout_slots enable row level security;

drop policy if exists "메인 레이아웃 읽기 모두 허용" on public.main_layout_slots;
create policy "메인 레이아웃 읽기 모두 허용"
  on public.main_layout_slots for select using (true);

drop policy if exists "메인 레이아웃 쓰기 관리자만" on public.main_layout_slots;
create policy "메인 레이아웃 쓰기 관리자만"
  on public.main_layout_slots for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- 메인 레이아웃 일괄 저장 RPC (관리자 전용)
create or replace function public.upsert_main_layout_slots(slots_json jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
  v_slot jsonb;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    raise exception 'not_admin';
  end if;
  delete from main_layout_slots;
  for v_slot in select * from jsonb_array_elements(slots_json)
  loop
    insert into main_layout_slots (slot_index, title, description, image_url, product_id, link_url)
    values (
      (v_slot->>'slot_index')::smallint,
      nullif(v_slot->>'title', ''),
      nullif(v_slot->>'description', ''),
      nullif(v_slot->>'image_url', ''),
      case when v_slot->>'product_id' is null or v_slot->>'product_id' = '' then null else (v_slot->>'product_id')::uuid end,
      nullif(v_slot->>'link_url', '')
    );
  end loop;
end;
$$;

-- 관리자: update public.profiles set is_admin = true where email = '본인이메일';
-- 그다음 docs/SUPABASE_SCHEMA_DASHBOARD_PRODUCT_REVIEWS.sql 실행 후, Storage에 버킷 review-photos (public) 생성.

-- ---------- 포인트 중복 방지: 이미 연동된 계정은 재연동 시 200p 다시 주지 않음 ----------
-- link_telegram 함수는 telegram_reward_given 이 false일 때만 200p 지급. 이미 연동된 프로필은 플래그만 맞춰 두기.
-- (한 번만 실행) 이미 telegram_id 가 있는데 telegram_reward_given 이 null/false 인 경우 true 로 통일:
-- update public.profiles set telegram_reward_given = true where telegram_id is not null and coalesce(telegram_reward_given, false) = false;
