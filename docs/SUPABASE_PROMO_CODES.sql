-- =============================================================================
-- 프로모코드(마켓플레이스 판매 완료 → 코드 생성·저장 → 웹에서 활성화 → 쿠폰 지급)
-- ProfileCoupons: supabase.rpc('redeem_promo_code', { p_code: '...' })
-- =============================================================================
--
-- 전체 흐름(권장)
-- 1) 와일드베리스/오존에서 판매 확정 시: 백오피스 스크립트·웹훅·크론이 Supabase에
--    "사용 전 코드" 한 줄씩 INSERT (또는 Edge Function이 service_role로 INSERT).
-- 2) 구매자는 웹에서 코드 입력 → redeem_promo_code RPC 한 번만 성공 가능.
-- 3) RPC가 검증 후 public.membership_coupons(또는 전용 user_coupons)에 행 추가.
--
-- 주의
-- - 코드 평문은 DB에 넣지 않는 편이 안전: pgcrypto로 digest(p_code, 'sha256') 등으로
--   정규화(대문자·trim)한 뒤 해시만 저장하고, 활성화 시에도 동일 해시로 조회.
-- - RLS: promo_codes는 일반 사용자 SELECT 불가(코드 목록 유출 방지). INSERT는
--   service_role 전용 또는 SECURITY DEFINER 함수(관리자만)로만.
-- - 동시에 같은 코드를 두 명이 쓰지 않도록: SELECT … FOR UPDATE 로 행 잠금 후
--   redeemed_at / user_id 갱신.
--
-- 아래는 스키마·RPC 예시(프로젝트 DB에 맞게 컬럼명·쿠폰 테이블 조정 후 적용).
-- =============================================================================

/*
-- 1) 사전 발급 코드 풀 (마켓 주문과 1:1 또는 N:1 배치)
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  -- 평문 대신 해시만 저장 권장 (아래 redeem에서 동일 규칙으로 비교)
  code_hash text not null unique,
  amount_rub int not null check (amount_rub > 0),
  expires_at timestamptz,
  source text,                    -- 'wb' | 'ozon' | 'manual' 등
  external_order_id text,         -- 마켓 주문번호 (추적·중복 발급 방지)
  status text not null default 'unused'
    check (status in ('unused', 'redeemed', 'void', 'expired')),
  redeemed_by uuid references public.profiles(id) on delete set null,
  redeemed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists promo_codes_external_idx
  on public.promo_codes (source, external_order_id);

alter table public.promo_codes enable row level security;

-- 일반 사용자: 테이블 직접 접근 없음 (정책 없음 또는 거부)
-- service_role / Edge Function으로만 INSERT

-- 2) 활성화 RPC (SECURITY DEFINER, authenticated만 실행)
create or replace function public.redeem_promo_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_norm text;
  v_hash text;
  r public.promo_codes%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  v_norm := upper(trim(p_code));
  if length(v_norm) < 4 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  v_hash := encode(digest(v_norm, 'sha256'), 'hex');  -- extension pgcrypto 필요: create extension if not exists pgcrypto;

  select * into r
  from public.promo_codes
  where code_hash = v_hash
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown_code');
  end if;

  if r.status <> 'unused' then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;

  if r.expires_at is not null and r.expires_at < now() then
    update public.promo_codes set status = 'expired' where id = r.id;
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- 쿠폰 지급: membership_coupons 또는 별도 테이블 (프로젝트 스키마에 맞게)
  -- insert into public.membership_coupons (user_id, amount, tier, quarter_label, expires_at, …) …;

  update public.promo_codes
  set status = 'redeemed', redeemed_by = uid, redeemed_at = now()
  where id = r.id;

  return jsonb_build_object('ok', true, 'amount_rub', r.amount_rub);
end;
$$;

grant execute on function public.redeem_promo_code(text) to authenticated;
*/
