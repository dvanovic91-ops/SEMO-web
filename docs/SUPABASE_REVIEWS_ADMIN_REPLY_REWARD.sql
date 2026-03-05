-- 리뷰 관리 탭: 관리자 대댓글(admin_reply) + 리뷰 포인트 지급(review_reward_points) 저장
-- Supabase SQL Editor에서 실행

-- product_reviews에 관리자 전용 컬럼 추가
alter table public.product_reviews
  add column if not exists admin_reply text,
  add column if not exists review_reward_points int not null default 0;

comment on column public.product_reviews.admin_reply is '관리자 대댓글. 관리자만 수정 가능';
comment on column public.product_reviews.review_reward_points is '리뷰 보상으로 지급한 포인트. 0=미지급, 200=일반, 500=특별. 중복 지급 방지용';

-- 관리자: product_reviews update 허용 (admin_reply, review_reward_points 수정용)
drop policy if exists "product_reviews_update_admin" on public.product_reviews;
create policy "product_reviews_update_admin"
  on public.product_reviews for update
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
