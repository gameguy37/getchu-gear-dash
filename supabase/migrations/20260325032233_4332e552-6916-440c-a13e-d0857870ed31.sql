
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS gallery_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS damage_photo_url text,
  ADD COLUMN IF NOT EXISTS home_parent_id uuid REFERENCES public.assets(id) ON DELETE SET NULL;
