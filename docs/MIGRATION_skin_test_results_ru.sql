-- .ru DB용 skin_test_results 컬럼 추가 마이그레이션
-- .com DB에서 추가된 컬럼들을 .ru에 동기화
-- 얀덱스 Supabase SQL 에디터에서 실행

alter table public.skin_test_results
  add column if not exists concern_text    text,
  add column if not exists concern_tags    text[],
  add column if not exists baumann_scores  jsonb,
  add column if not exists age             text,
  add column if not exists gender          text,
  add column if not exists routine         text,
  add column if not exists source          text,
  add column if not exists dehydrated_oily boolean,
  add column if not exists selfie_analysis jsonb,
  add column if not exists ai_analysis     jsonb;

-- RLS 재확인: INSERT(WITH CHECK) 포함
drop policy if exists "본인 테스트 결과만" on public.skin_test_results;
drop policy if exists "본인 테스트 결과만 조회" on public.skin_test_results;

create policy "본인 테스트 결과만"
  on public.skin_test_results for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
