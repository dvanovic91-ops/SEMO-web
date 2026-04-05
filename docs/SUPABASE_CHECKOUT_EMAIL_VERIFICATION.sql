-- =============================================================================
-- 주문(체크아웃) 전 이메일 소유 확인용 — profiles 컬럼 + 가입 시 OAuth만 자동 승인
-- Supabase SQL Editor에서 한 번 실행하세요.
-- 이어서 RLS·RPC(주문 INSERT 제한, confirm_checkout_email)는
-- docs/SUPABASE_ORDER_EMAIL_VERIFICATION_RPC_AND_RLS.sql 을 실행하세요.
-- =============================================================================

-- 1) 컬럼 추가
alter table public.profiles
  add column if not exists email_verified_at timestamptz,
  add column if not exists checkout_email_verify_token text,
  add column if not exists checkout_email_verify_expires_at timestamptz;

comment on column public.profiles.email_verified_at is '이메일/비밀번호 가입자는 체크아웃 전 매직링크로 확인 후 채움. OAuth(google/yandex)는 가입 시 자동 설정.';
comment on column public.profiles.checkout_email_verify_token is '체크아웃 이메일 확인용 일회성 토큰(쿼리 ck=).';
comment on column public.profiles.checkout_email_verify_expires_at is '토큰 만료 시각.';

-- 2) 기존 회원: 주문 막지 않도록 전원 이미 확인된 것으로 간주(1회 백필)
-- (ORDER_EMAIL_VERIFICATION RPC 적용 후에는 protect 트리거가 있으므로 set_config 필요)
select set_config('app.allow_email_verified_write', '1', true);
update public.profiles
set email_verified_at = coalesce(email_verified_at, now())
where email_verified_at is null;
select set_config('app.allow_email_verified_write', '', true);

-- 3) 신규 가입: OAuth(google/yandex)만 즉시 verified, 이메일+비밀번호는 null → 체크아웃에서 확인
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

-- 트리거가 없으면 생성(이미 있으면 유지)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- 운영자가 꼭 할 일 (대시보드)
-- 1) Authentication → Providers → 이메일: "Confirm email" 을 끄면 가입 직후 세션(즉시 로그인) 가능.
-- 2) Authentication → URL Configuration:
--    - Site URL = 프로덕션 도메인
--    - Redirect URLs: https://ваш-домен.ru/auth/callback (매직링크 ck), /checkout, /profile, 또는 /** 
-- 3) 매직 링크(OTP) 메일이 스팸으로 가지 않도록 SPF/DKIM(커스텀 SMTP) 권장.
--
-- URL Configuration이 헷갈리면 docs/SUPABASE_AUTH_URL_CONFIGURATION.md 참고.
-- =============================================================================
