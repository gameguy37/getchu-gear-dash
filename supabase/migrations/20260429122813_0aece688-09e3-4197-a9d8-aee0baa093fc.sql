ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS cable_length text;