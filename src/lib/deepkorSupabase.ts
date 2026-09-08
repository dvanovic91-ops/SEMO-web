import { createClient } from '@supabase/supabase-js';

/**
 * Deepkor(koskos) 전용 Supabase 클라이언트 — 세모박스 자체 커머스 Supabase(`./supabase.ts`)와는
 * 완전히 별개의 프로젝트다(오라클 서버에 셀프호스팅, DB도 분리). semo-box.com이 Deepkor 전용
 * 도메인이 없어서 관리자 웹앱을 이 레포의 `/koskos/{경로}`로 얹었기 때문에 이 클라이언트가 필요함
 * (`project_admin_web_app_plan` 세션 메모리 참고).
 *
 * URL/anon key는 Deepkor Flutter 앱(`lib/services/supabase_service.dart`)과 완전히 동일한 값 —
 * anon key라 프론트에 노출돼도 안전(서비스 룸키가 아님). RLS가 접근을 통제한다.
 */
const DEEPKOR_SUPABASE_URL = 'https://app-api.semo-box.com';
const DEEPKOR_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg3MDQ2OTkyLCJleHAiOjE5NDQ3MjY5OTJ9.oVl5eBPmvNZSNEIism5LtgNAu2obtSZb74dISPBtCgc';

export const deepkorSupabase = createClient(DEEPKOR_SUPABASE_URL, DEEPKOR_SUPABASE_ANON_KEY, {
  auth: {
    // 이 페이지 전용 세션 — 세모박스 커머스 로그인 세션과 스토리지 키가 겹치면 안 되므로
    // storageKey를 분리한다(둘 다 localStorage를 쓰지만 supabase-js 기본 키가 프로젝트별로
    // 자동 분리되긴 하나, 명시적으로 지정해 실수 방지).
    storageKey: 'koskos-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
