-- 비밀번호 재설정 전 "이 이메일로 가입했는지" 확인용 RPC (선택).
-- Supabase SQL Editor에서 한 번 실행 후 사용.
--
-- 주의: anon 이 호출 가능하면 이메일 가입 여부를 알아낼 수 있음(계정 열거).
--       메일 남용 방지·UX와 보안(프라이버시) 트레이드오프를 팀에서 판단할 것.
--       적용하지 않으면 프론트는 RPC 실패 시 기존처럼 재설정 메일만 보냄.

create or replace function public.check_email_registered_for_reset(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from auth.users u
    where u.email is not null
      and lower(trim(u.email::text)) = lower(trim(p_email))
  );
$$;

comment on function public.check_email_registered_for_reset(text) is
  '비밀번호 찾기: auth.users 에 해당 email 이 있는지. 열거 위험 있음.';

revoke all on function public.check_email_registered_for_reset(text) from public;
grant execute on function public.check_email_registered_for_reset(text) to anon;
grant execute on function public.check_email_registered_for_reset(text) to authenticated;
