-- 핵심 한 줄(Gemini product_claim)용 선택 컨텍스트 — 브랜드 차별 포인트 · 외부 의견 테마 요약(KO 우선 수집 가정)
alter table public.sku_items
  add column if not exists claim_brand_hook text,
  add column if not exists consumer_theme_summary text;

comment on column public.sku_items.claim_brand_hook is 'Optional: brand differentiator for AI claim (e.g. signature extract, line story)';
comment on column public.sku_items.consumer_theme_summary is 'Optional: staff-pasted synthesized review themes (Korean-first gathering recommended)';
