-- CS 방어용: 가격/결제 타임라인 로그 + 결제 증거
-- 1) activity_logs: "몇 시에 어떤 가격 봤고, 몇 시에 결제 버튼 눌렀다" 타임라인
-- 2) orders 컬럼 추가: 결제 시점 스냅샷·PG 거래 ID·클라이언트 정보
-- 3) payment_logs: 결제 실패 시 에러 코드/메시지 (PG사 조회용)
-- Supabase 대시보드 → SQL Editor에서 실행

-- ---------- 1. activity_logs (제미나이 제안 구조 + order_id 선택) ----------
create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text not null,  -- 예: 'checkout_price_viewed', 'clicked_pay_button'
  metadata jsonb default '{}',  -- 예: { "total_cents": 180000, "items": [...] }
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_insert_own" on public.activity_logs;
create policy "activity_logs_insert_own"
  on public.activity_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "activity_logs_select_own_or_admin" on public.activity_logs;
create policy "activity_logs_select_own_or_admin"
  on public.activity_logs for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

-- ---------- 2. orders 컬럼 추가 ----------
alter table public.orders
  add column if not exists snapshot_total_cents int,
  add column if not exists snapshot_items jsonb,
  add column if not exists client_ip text,
  add column if not exists user_agent text,
  add column if not exists payment_gateway_id text,
  add column if not exists external_transaction_id text,
  add column if not exists raw_response jsonb;

comment on column public.orders.snapshot_total_cents is '결제 버튼 클릭 시점의 최종 금액(코펙). CS 시 "이 금액 보고 결제하셨음" 증거';
comment on column public.orders.snapshot_items is '결제 시점 품목 스냅샷 (이름·가격·수량)';
comment on column public.orders.payment_gateway_id is 'PG사 payment_intent_id (레거시). external_transaction_id 사용 권장';
comment on column public.orders.external_transaction_id is '결제사(PG) 고유 거래 번호. Stripe/로컬 PG 연동 시 여기 저장';
comment on column public.orders.raw_response is '결제사가 보내준 전체 응답 JSON. PG 연동 시 저장, 분쟁·영수증 확인용';
comment on column public.orders.client_ip is '결제 시점 클라이언트 IP';
comment on column public.orders.user_agent is '결제 시점 브라우저 정보';

-- 주문 상태: PG 표준 pending → completed/canceled/failed, 배송 단계 shipped → delivered
-- (기존 paid는 completed로 마이그레이션 권장)

-- ---------- 3. payment_logs (결제 실패·에러 기록) ----------
create table if not exists public.payment_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  payment_gateway_id text,
  error_code text,
  error_message text,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

alter table public.payment_logs enable row level security;

drop policy if exists "payment_logs_insert_own" on public.payment_logs;
create policy "payment_logs_insert_own"
  on public.payment_logs for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "payment_logs_select_admin" on public.payment_logs;
create policy "payment_logs_select_admin"
  on public.payment_logs for select
  to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and is_admin = true));
