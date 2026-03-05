-- 리뷰 삭제: 작성자 본인 또는 관리자만 삭제 가능하도록 RLS 정책
-- Supabase SQL Editor에서 실행

-- product_reviews: 본인 작성 리뷰 삭제 허용
-- 관리자: 모든 리뷰 삭제 허용
drop policy if exists "product_reviews_delete_own" on public.product_reviews;
create policy "product_reviews_delete_own"
  on public.product_reviews for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "product_reviews_delete_admin" on public.product_reviews;
create policy "product_reviews_delete_admin"
  on public.product_reviews for delete
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- review_photos: 해당 리뷰의 작성자 또는 관리자만 삭제 (review_id로 product_reviews와 연결)
-- Supabase는 FK 쪽에서 delete 시 부모 정책만 보는 경우가 있어, review_photos는 product_reviews 삭제 시 CASCADE로 같이 지워지게 하거나,
-- 여기서는 review_photos에 대해 "리뷰 작성자 또는 관리자" 조건을 줄 수 있음 (product_reviews 조인)
-- 단순화: authenticated 사용자가 자신이 쓴 리뷰의 사진만 삭제 가능 + 관리자 전체 삭제
drop policy if exists "review_photos_delete_own_review" on public.review_photos;
create policy "review_photos_delete_own_review"
  on public.review_photos for delete
  to authenticated
  using (
    exists (select 1 from public.product_reviews pr where pr.id = review_photos.review_id and pr.user_id = auth.uid())
  );

drop policy if exists "review_photos_delete_admin" on public.review_photos;
create policy "review_photos_delete_admin"
  on public.review_photos for delete
  to authenticated
  using (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
