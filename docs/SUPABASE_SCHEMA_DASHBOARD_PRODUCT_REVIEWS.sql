-- =============================================================================
-- 대시보드·상품 상세·리뷰용 스키마 (기존 SUPABASE_FULL_SCHEMA.sql 실행 후 실행)
-- =============================================================================
-- products: stock, detail_description 추가
-- product_views: 상품별 조회수
-- product_components: 상품 구성품 (1,2,3...)
-- product_reviews, review_photos: 상품 리뷰 + 사진
-- =============================================================================

-- products 컬럼 추가
alter table public.products add column if not exists stock int default 0;
alter table public.products add column if not exists detail_description text;

-- ---------- product_views (상품별 조회수: 상세 페이지 진입 시 1건 기록) ----------
create table if not exists public.product_views (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  viewed_at timestamptz default now()
);

create index if not exists idx_product_views_product_id on public.product_views(product_id);
create index if not exists idx_product_views_viewed_at on public.product_views(viewed_at);

alter table public.product_views enable row level security;

drop policy if exists "product_views 모두 삽입" on public.product_views;
create policy "product_views 모두 삽입"
  on public.product_views for insert with check (true);

drop policy if exists "product_views 관리자 조회" on public.product_views;
create policy "product_views 관리자 조회"
  on public.product_views for select
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- ---------- product_components (구성품 1,2,3... 관리자 설정, 항목당 이미지 여러 장) ----------
create table if not exists public.product_components (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  sort_order smallint not null default 0,
  name text,
  image_url text,
  image_urls jsonb default '[]',
  description text,
  created_at timestamptz default now()
);
alter table public.product_components add column if not exists image_urls jsonb default '[]';

alter table public.product_components enable row level security;

drop policy if exists "product_components 읽기 모두" on public.product_components;
create policy "product_components 읽기 모두"
  on public.product_components for select using (true);

drop policy if exists "product_components 쓰기 관리자" on public.product_components;
create policy "product_components 쓰기 관리자"
  on public.product_components for all
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true))
  with check (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));

-- ---------- product_reviews (상품 리뷰, 별점+텍스트) ----------
create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  rating int not null check (rating >= 1 and rating <= 5),
  body text,
  created_at timestamptz default now()
);

alter table public.product_reviews enable row level security;

drop policy if exists "product_reviews 읽기 모두" on public.product_reviews;
create policy "product_reviews 읽기 모두"
  on public.product_reviews for select using (true);

drop policy if exists "product_reviews 삽입 로그인" on public.product_reviews;
create policy "product_reviews 삽입 로그인"
  on public.product_reviews for insert
  with check (auth.uid() = user_id);

drop policy if exists "product_reviews 수정 삭제 본인" on public.product_reviews;
create policy "product_reviews 수정 삭제 본인"
  on public.product_reviews for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- review_photos (리뷰 사진 URL, Supabase Storage 업로드 후 URL 저장) ----------
create table if not exists public.review_photos (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  image_url text not null,
  sort_order smallint default 0,
  created_at timestamptz default now()
);

alter table public.review_photos enable row level security;

drop policy if exists "review_photos 읽기 모두" on public.review_photos;
create policy "review_photos 읽기 모두"
  on public.review_photos for select using (true);

drop policy if exists "review_photos 삽입 리뷰 작성자" on public.review_photos;
create policy "review_photos 삽입 리뷰 작성자"
  on public.review_photos for insert
  with check (
    exists (
      select 1 from public.product_reviews r
      where r.id = review_id and r.user_id = auth.uid()
    )
  );

drop policy if exists "review_photos 삭제 리뷰 작성자" on public.review_photos;
create policy "review_photos 삭제 리뷰 작성자"
  on public.review_photos for delete
  using (
    exists (
      select 1 from public.product_reviews r
      where r.id = review_id and r.user_id = auth.uid()
    )
  );

-- orders에 total_cents 있음 → 매출 집계 가능. contact_phone 등 필요 시 별도 추가.

-- Storage: Dashboard → Storage → New bucket 이름 review-photos, Public ON. Policies: authenticated INSERT, public SELECT.
