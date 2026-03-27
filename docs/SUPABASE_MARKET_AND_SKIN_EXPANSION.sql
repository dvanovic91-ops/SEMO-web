-- Multi-country pricing table (Admin editable by currency)
create table if not exists public.product_market_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  currency text not null check (currency in ('RUB', 'KZT', 'AED', 'USD')),
  rrp_price integer,
  prp_price integer,
  updated_at timestamptz not null default now(),
  primary key (product_id, currency)
);

create index if not exists idx_product_market_prices_product_id
  on public.product_market_prices(product_id);

-- Skin selfie progress snapshots (monthly/quarterly tracking)
create table if not exists public.skin_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle text not null check (cycle in ('monthly', 'quarterly')),
  base_score integer not null,
  selfie_score integer not null,
  adjusted_score integer not null,
  summary text not null,
  concerns jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  selfie_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_skin_progress_user_created_at
  on public.skin_progress_snapshots(user_id, created_at desc);

