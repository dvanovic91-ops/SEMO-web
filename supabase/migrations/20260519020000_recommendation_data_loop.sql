-- Recommendation data loop: snapshot -> behavior events -> order -> post-purchase feedback

create table if not exists public.recommendation_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skin_test_result_id uuid references public.skin_test_results(id) on delete set null,
  skin_type text,
  baumann_scores jsonb,
  selfie_metrics jsonb,
  recommended_product_id uuid references public.products(id) on delete set null,
  recommended_sku_ids uuid[] default '{}',
  recommended_items jsonb default '[]'::jsonb,
  skin_fit_score numeric(5,2),
  box_fit_score numeric(5,2),
  confidence_score numeric(5,2),
  reason_codes text[] default '{}',
  matcher_version text not null default 'skin-type-slot-v1',
  context jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_snapshots_user_created_idx
  on public.recommendation_snapshots(user_id, created_at desc);
create index if not exists recommendation_snapshots_skin_type_idx
  on public.recommendation_snapshots(skin_type);
create index if not exists recommendation_snapshots_product_idx
  on public.recommendation_snapshots(recommended_product_id);

alter table public.recommendation_snapshots enable row level security;

drop policy if exists "recommendation_snapshots_select_own" on public.recommendation_snapshots;
create policy "recommendation_snapshots_select_own"
  on public.recommendation_snapshots for select
  using (auth.uid() = user_id);

drop policy if exists "recommendation_snapshots_insert_own" on public.recommendation_snapshots;
create policy "recommendation_snapshots_insert_own"
  on public.recommendation_snapshots for insert
  with check (auth.uid() = user_id);

drop policy if exists "recommendation_snapshots_update_own" on public.recommendation_snapshots;
create policy "recommendation_snapshots_update_own"
  on public.recommendation_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.recommendation_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  recommendation_snapshot_id uuid references public.recommendation_snapshots(id) on delete set null,
  skin_test_result_id uuid references public.skin_test_results(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  event_type text not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists recommendation_events_snapshot_created_idx
  on public.recommendation_events(recommendation_snapshot_id, created_at desc);
create index if not exists recommendation_events_user_created_idx
  on public.recommendation_events(user_id, created_at desc);
create index if not exists recommendation_events_type_idx
  on public.recommendation_events(event_type);

alter table public.recommendation_events enable row level security;

drop policy if exists "recommendation_events_select_own" on public.recommendation_events;
create policy "recommendation_events_select_own"
  on public.recommendation_events for select
  using (auth.uid() = user_id);

drop policy if exists "recommendation_events_insert_own_or_anon" on public.recommendation_events;
create policy "recommendation_events_insert_own_or_anon"
  on public.recommendation_events for insert
  with check (user_id is null or auth.uid() = user_id);

alter table public.orders
  add column if not exists recommendation_snapshot_id uuid references public.recommendation_snapshots(id) on delete set null,
  add column if not exists skin_test_result_id uuid references public.skin_test_results(id) on delete set null,
  add column if not exists skin_type_at_purchase text,
  add column if not exists recommendation_match_score numeric(5,2);

create index if not exists orders_recommendation_snapshot_idx
  on public.orders(recommendation_snapshot_id);

alter table public.skin_test_results
  add column if not exists recent_irritation text,
  add column if not exists fragrance_sensitivity text;

create table if not exists public.recommendation_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  recommendation_snapshot_id uuid references public.recommendation_snapshots(id) on delete set null,
  overall_rating int check (overall_rating between 1 and 5),
  skin_fit_rating int check (skin_fit_rating between 1 and 5),
  irritation_reported boolean,
  favorite_product_id uuid references public.products(id) on delete set null,
  disliked_product_id uuid references public.products(id) on delete set null,
  component_feedback jsonb default '{}'::jsonb,
  repurchase_intent boolean,
  comment text,
  reward_points int not null default 0,
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, order_id)
);

create index if not exists recommendation_feedback_snapshot_idx
  on public.recommendation_feedback(recommendation_snapshot_id);
create index if not exists recommendation_feedback_user_created_idx
  on public.recommendation_feedback(user_id, created_at desc);

alter table public.recommendation_feedback enable row level security;

drop policy if exists "recommendation_feedback_select_own" on public.recommendation_feedback;
create policy "recommendation_feedback_select_own"
  on public.recommendation_feedback for select
  using (auth.uid() = user_id);

drop policy if exists "recommendation_feedback_insert_own" on public.recommendation_feedback;
create policy "recommendation_feedback_insert_own"
  on public.recommendation_feedback for insert
  with check (auth.uid() = user_id);

drop policy if exists "recommendation_feedback_update_own" on public.recommendation_feedback;
create policy "recommendation_feedback_update_own"
  on public.recommendation_feedback for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.recommendation_snapshots is '추천 당시 입력·점수·추천 결과 스냅샷. 추천 로직 성과 분석의 기준점.';
comment on table public.recommendation_events is '추천 이후 클릭, 장바구니, 체크아웃, 구매 등 행동 이벤트.';
comment on table public.recommendation_feedback is '구매 후 추천 만족도·자극·재구매 의향 피드백.';
