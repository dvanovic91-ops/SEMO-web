-- Director Pi curation (NotebookLM) per SKU — used for baumann compute + Gemini context
ALTER TABLE public.sku_items
  ADD COLUMN IF NOT EXISTS pi_profile JSONB;

COMMENT ON COLUMN public.sku_items.pi_profile IS
  'Pi curation: video_says_for[], avoid_for[], texture_feel, why_ko';
