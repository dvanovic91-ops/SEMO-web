-- 셀피 분석 수치·텍스트 스냅샷 (원본 이미지는 저장하지 않음)
ALTER TABLE public.skin_test_results
  ADD COLUMN IF NOT EXISTS selfie_analysis jsonb;

COMMENT ON COLUMN public.skin_test_results.selfie_analysis IS
  '셀피 분석 스냅샷: { "analyzed_at": ISO8601, "skin_metrics": {...}, "gemini_analysis": {...} }';
