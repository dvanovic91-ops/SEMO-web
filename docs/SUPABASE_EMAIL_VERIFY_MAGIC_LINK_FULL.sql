-- =============================================================================
-- 매직링크 이메일 확인(프로필·체크아웃) — 한 번에 실행용
-- Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run
--
-- 구성: SUPABASE_CHECKOUT_EMAIL_VERIFICATION.sql + SUPABASE_ORDER_EMAIL_VERIFICATION_RPC_AND_RLS.sql
-- 선행 없음(이 파일만 실행하면 됨).
--
-- 주의
-- - 이미 다른 handle_new_user / on_auth_user_created 가 있으면 트리거 구간을 수동 병합하세요.
-- - 아래 "기존 회원 백필" UPDATE 는 email_verified_at 이 null 인 모든 프로필을 지금 시각으로 채웁니다.
--   신규만 나중에 인증시키고 기존 회원은 그대로 두려면 해당 UPDATE 블록을 제거한 뒤 실행하세요.
-- =============================================================================

-- ---------- Part A: 컬럼 + 가입 트리거 (CHECKOUT_EMAIL_VERIFICATION) ----------

alter table public.profiles
  add column if not exists email_verified_at timestamptz,
  add column if not exists checkout_email_verify_token text,
  add column if not exists checkout_email_verify_expires_at timestamptz;

comment on column public.profiles.email_verified_at is '이메일/비밀번호 가입자는 매직링크로 확인 후 채움. OAuth(google/yandex)는 가입 시 자동 설정.';
comment on column public.profiles.checkout_email_verify_token is '이메일 확인용 일회성 토큰(쿼리 ck=).';
comment on column public.profiles.checkout_email_verify_expires_at is '토큰 만료 시각.';

-- 기존 회원 전원 인증 처리(원하지 않으면 이 블록 전체 삭제 후 실행)
-- trg_profile_email_verified_at 가 이미 있으면, 이 UPDATE 는 app.allow_email_verified_write 없이 실패(42501)함
select set_config('app.allow_email_verified_write', '1', true);
update public.profiles
set email_verified_at = coalesce(email_verified_at, now())
where email_verified_at is null;
select set_config('app.allow_email_verified_write', '', true);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text;
  v_verified_at timestamptz;
  v_name text;
begin
  v_provider := coalesce(lower(trim(new.raw_app_meta_data->>'provider')), '');
  if v_provider in ('google', 'yandex') then
    v_verified_at := now();
  else
    v_verified_at := null;
  end if;

  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'nickname'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, email, name, email_verified_at)
  values (new.id, new.email, v_name, v_verified_at);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- Part B: RPC + RLS (ORDER_EMAIL_VERIFICATION_RPC_AND_RLS) ----------

create or replace function public.current_user_is_admin_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select (p.is_admin = true or p.is_manager = true) from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.protect_profile_email_verified_at_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_admin boolean;
begin
  if new.email_verified_at is distinct from old.email_verified_at then
    select coalesce(p.is_admin, false) or coalesce(p.is_manager, false)
    into v_admin
    from public.profiles p
    where p.id = auth.uid();

    if coalesce(v_admin, false) then
      return new;
    end if;

    if current_setting('app.allow_email_verified_write', true) is distinct from '1' then
      raise exception 'email_verified_at can only be set via confirm_checkout_email()'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_email_verified_at on public.profiles;
create trigger trg_profile_email_verified_at
  before update on public.profiles
  for each row
  execute function public.protect_profile_email_verified_at_write();

create or replace function public.confirm_checkout_email(p_token text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated uuid;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if p_token is null or length(trim(p_token)) < 10 then
    return json_build_object('ok', false, 'error', 'invalid_token');
  end if;

  perform set_config('app.allow_email_verified_write', '1', true);

  update public.profiles
  set
    email_verified_at = now(),
    checkout_email_verify_token = null,
    checkout_email_verify_expires_at = null
  where id = v_uid
    and checkout_email_verify_token = p_token
    and checkout_email_verify_expires_at is not null
    and checkout_email_verify_expires_at > now()
  returning id into v_updated;

  perform set_config('app.allow_email_verified_write', '', true);

  if v_updated is null then
    return json_build_object('ok', false, 'error', 'invalid_or_expired');
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.confirm_checkout_email(text) from public;
grant execute on function public.confirm_checkout_email(text) to authenticated;

comment on function public.confirm_checkout_email(text) is
  '이메일 매직링크 확인: 본인(auth.uid()) 행만, 토큰·만료 일치 시 email_verified_at 설정';

create or replace function public.profile_has_order_email_verified()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.email_verified_at is not null from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

drop policy if exists "orders_insert_own" on public.orders;
drop policy if exists "orders_insert_own_email_verified" on public.orders;

create policy "orders_insert_own_email_verified"
  on public.orders
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      public.profile_has_order_email_verified()
      or public.current_user_is_admin_or_manager()
    )
  );

comment on policy "orders_insert_own_email_verified" on public.orders is
  '일반 사용자: 본인 주문 + 이메일 확인됨. 관리자/매니저: 삽입 허용';
