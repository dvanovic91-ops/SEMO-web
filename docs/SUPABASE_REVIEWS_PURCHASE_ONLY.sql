-- product_reviews: 실제로 해당 상품을 구매한 사용자만 리뷰 작성 가능하도록 RLS 강화
-- Supabase SQL Editor에서 실행

-- 1) 기존 "로그인만" 삽입 정책 제거
drop policy if exists "product_reviews 삽입 로그인" on public.product_reviews;

-- 2) 새 삽입 정책: 로그인 + orders에 해당 상품 구매 이력이 있는 경우만 허용
create policy "product_reviews 삽입 구매자만"
  on public.product_reviews for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.orders o,
           jsonb_array_elements(coalesce(o.items, o.snapshot_items, '[]'::jsonb)) as it(val)
      where o.id = order_id
        and o.user_id = auth.uid()
        and (o.status is null or o.status not in ('pending', 'failed', 'canceled', 'refunded'))
        and it.val->>'id' = product_id::text
    )
  );

