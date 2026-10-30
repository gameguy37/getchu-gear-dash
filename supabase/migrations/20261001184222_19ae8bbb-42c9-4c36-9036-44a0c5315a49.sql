ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS original_parent_id uuid NULL REFERENCES public.assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assets_original_parent_id_idx
ON public.assets(original_parent_id);