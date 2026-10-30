ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS original_value numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replacement_cost numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replaced_at timestamptz DEFAULT NULL;