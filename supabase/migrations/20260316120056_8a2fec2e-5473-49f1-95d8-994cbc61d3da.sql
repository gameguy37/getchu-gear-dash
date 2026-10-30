
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS contact_name text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS on_site_contact text;
