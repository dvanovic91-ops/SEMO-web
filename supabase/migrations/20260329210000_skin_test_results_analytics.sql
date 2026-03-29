-- 피부 테스트: 리포트·CRM용 상세 필드 (점수·AI 문구)
ALTER TABLE public.skin_test_results
  ADD COLUMN IF NOT EXISTS concern_text text,
  ADD COLUMN IF NOT EXISTS baumann_scores jsonb,
  ADD COLUMN IF NOT EXISTS ai_analysis jsonb;

COMMENT ON COLUMN public.skin_test_results.concern_text IS '테스트 직후 고객이 남긴 피부 고민 자유기술';
COMMENT ON COLUMN public.skin_test_results.baumann_scores IS '4축 점수 JSON: {"1":n,"2":n,"3":n,"4":n} (Dry/Oily, Sens/Res, Pigm, Aging)';
COMMENT ON COLUMN public.skin_test_results.ai_analysis IS 'analyze-text API 응답 스냅샷: { "en", "ru", "ko" }';
