-- =============================================================================
-- OAuth(구글/얀덱스) 로그인 시 profiles.email_verified_at 동기화
-- 선행: docs/SUPABASE_ORDER_EMAIL_VERIFICATION_RPC_AND_RLS.sql (트리거) 적용 후 실행
--
-- 이유: protect_profile_email_verified_at_write 트리거 때문에 일반 UPDATE는 막힘.
--       confirm_checkout_email 과 같이 app.allow_email_verified_write=1 을 켠 뒤만 갱신 가능.
-- =============================================================================

-- 1) Edge Function(yandex-auth, service_role 전용) — 임의 user_id (서버에서만 호출)
create or replace function public.oauth_sync_email_verified_for_user(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'error', 'null_user');
  end if;

  perform set_config('app.allow_email_verified_write', '1', true);
  update public.profiles
  set email_verified_at = coalesce(email_verified_at, now())
  where id = p_user_id
    and email_verified_at is null;
  perform set_config('app.allow_email_verified_write', '', true);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.oauth_sync_email_verified_for_user(uuid) from public;
grant execute on function public.oauth_sync_email_verified_for_user(uuid) to service_role;

comment on function public.oauth_sync_email_verified_for_user(uuid) is
  'OAuth 완료 후 service_role(Edge)만 호출 — profiles.email_verified_at 백필';


-- 2) 로그인한 사용자 본인 — auth.users 가 google/yandex(또는 yandex_id 메타)일 때만
create or replace function public.sync_own_oauth_email_verified()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_provider text;
  v_raw jsonb;
  v_yandex_id text;
  v_oauth boolean := false;
begin
  if v_uid is null then
    return json_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select
    coalesce(u.raw_app_meta_data->>'provider', ''),
    coalesce(u.raw_app_meta_data, '{}'::jsonb),
    nullif(trim(coalesce(u.raw_user_meta_data->>'yandex_id', '')), '')
  into v_provider, v_raw, v_yandex_id
  from auth.users u
  where u.id = v_uid;

  if not found then
    return json_build_object('ok', false, 'error', 'user_not_found');
  end if;

  v_oauth := v_provider in ('google', 'yandex')
    or coalesce(v_raw->'providers', '[]'::jsonb) @> '["google"]'::jsonb
    or coalesce(v_raw->'providers', '[]'::jsonb) @> '["yandex"]'::jsonb
    or v_yandex_id is not null;

  if not v_oauth then
    return json_build_object('ok', false, 'error', 'not_oauth');
  end if;

  perform set_config('app.allow_email_verified_write', '1', true);
  update public.profiles
  set email_verified_at = coalesce(email_verified_at, now())
  where id = v_uid
    and email_verified_at is null;
  perform set_config('app.allow_email_verified_write', '', true);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.sync_own_oauth_email_verified() from public;
grant execute on function public.sync_own_oauth_email_verified() to authenticated;

comment on function public.sync_own_oauth_email_verified() is
  '구글/얀덱스(또는 user_metadata.yandex_id) 계정이 프로필 이메일 미검증이면 본인 행만 채움';
