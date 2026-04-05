-- =============================================================================
-- profiles 민감 컬럼 보호 트리거
-- 일반 유저가 is_admin, is_manager, grade, points, telegram_reward_given을
-- 직접 UPDATE하지 못하도록 트리거로 차단.
-- auth.uid() = NULL(서비스 롤/Edge Function)은 허용, 관리자 계정도 허용.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_sensitive_profile_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- auth.uid()가 NULL이면 서비스 롤(Edge Function 등) → 모든 수정 허용
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 관리자는 모든 수정 허용
  IF public.current_user_is_admin() THEN
    RETURN NEW;
  END IF;

  -- 일반 유저: 민감 컬럼을 이전 값으로 강제 복원 (UPDATE는 성공하지만 해당 필드는 변경 안 됨)
  NEW.is_admin             := OLD.is_admin;
  NEW.is_manager           := OLD.is_manager;
  NEW.grade                := OLD.grade;
  NEW.points               := OLD.points;
  NEW.telegram_reward_given := OLD.telegram_reward_given;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_sensitive_profile_columns_trigger ON public.profiles;
CREATE TRIGGER protect_sensitive_profile_columns_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_sensitive_profile_columns();

COMMENT ON FUNCTION public.protect_sensitive_profile_columns() IS
  '일반 유저가 RLS UPDATE 정책을 통해 민감 컬럼(is_admin 등)을 변경하지 못하도록 차단.
   서비스 롤(auth.uid() IS NULL) 및 관리자는 허용.';
