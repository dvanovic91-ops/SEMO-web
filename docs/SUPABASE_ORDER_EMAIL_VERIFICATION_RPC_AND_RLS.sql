-- =============================================================================
-- 주문 전 이메일 확인 — 서버 측 강제 (RPC + 트리거 + orders INSERT RLS)
-- 선행: docs/SUPABASE_CHECKOUT_EMAIL_VERIFICATION.sql (컬럼 + handle_new_user) 실행 후 이 파일 실행
-- Supabase SQL Editor에서 한 번 실행
-- =============================================================================

-- RLS 하드닝 스크립트를 안 돌렸을 때를 대비: 관리자 판별 함수 (이미 있으면 replace)
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

-- -----------------------------------------------------------------------------
-- 1) 직접 UPDATE로 email_verified_at 위조 방지 — RPC에서만 허용 (관리자는 예외)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2) 매직링크 복귀 시 토큰 검증 + 본인 행만 갱신 (SECURITY DEFINER, RLS 우회 없이 트리거로 통제)
-- -----------------------------------------------------------------------------
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
  '체크아웃 이메일 확인: 본인(auth.uid()) 행만, 토큰·만료 일치 시 email_verified_at 설정';

-- -----------------------------------------------------------------------------
-- 3) 주문 INSERT: 본인 user_id + profiles.email_verified_at IS NOT NULL (관리자·매니저는 예외)
-- -----------------------------------------------------------------------------
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
  '일반 사용자: 본인 주문 + 이메일(주문용) 확인됨. 관리자/매니저: 기존과 동일하게 삽입 허용';

-- -----------------------------------------------------------------------------
-- 참고: current_user_is_admin_or_manager() 가 없으면 SUPABASE_RLS_HARDENING_AND_SIMULATION.sql 먼저 실행
-- =============================================================================
